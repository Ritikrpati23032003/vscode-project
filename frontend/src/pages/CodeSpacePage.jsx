import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

import FileExplorer from '../components/FileExplorer';
import Editor from '../components/Editor';
import Terminal from '../components/Terminal';
import TabBar from '../components/TabBar';
import PasscodeModal from '../components/PasscodeModal'; // For SETTING a new passcode
import JoinPrivateModal from '../components/JoinPrivateModal'; // For ENTERING a passcode to join
import { useAppContext } from '../Context';


function CodeSpacePage() {
  const { spaceName } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const terminalComponentRef = useRef(null);
  const { API_URL, SOCKET_URL, verified } = useAppContext()
  // --- Data State ---
  const [files, setFiles] = useState([]);
  const [openFiles, setOpenFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);

  // --- UI & Authentication State ---
  const [isDataLoaded, setIsDataLoaded] = useState(false); // Gatekeeper for the main UI
  const [isLoading, setIsLoading] = useState(true); // General loading for API calls
  const [showAuthModal, setShowAuthModal] = useState(false); // Controls visibility of the joining modal
  const [authError, setAuthError] = useState(''); // Error message for the joining modal

  // Other existing states
  const [isPublic, setIsPublic] = useState(true);
  const [isSetPrivacyModalOpen, setIsSetPrivacyModalOpen] = useState(false); // Differentiated from the auth modal
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  // This function fetches the full codespace data if the user is authorized
  const fetchCodeSpaceData = async (passcode = null) => {
    setIsLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${API_URL}/api/codespaces/${spaceName}/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });

      if (!res.ok) {
        if (res.status === 401) throw new Error('Incorrect passcode.');
        throw new Error('Could not fetch codespace data.');
      }

      const data = await res.json();

      // --- Success! Populate the application state ---
      setFiles(data.files);
      setIsPublic(data.isPublic);
      if (data.files && data.files.length > 0) {
        setOpenFiles([data.files[0]]);
        setActiveFile(data.files[0]);
      }
      setShowAuthModal(false);
      setIsDataLoaded(true); // This grants access to the main UI

      // Initialize the socket connection only AFTER successful auth
      const socket = io(SOCKET_URL);
      socketRef.current = socket;
      socket.emit('join-space', { spaceName });
      initializeSocketListeners(socket);

    } catch (error) {
      console.error(error.message);
      setAuthError(error.message);
      setShowAuthModal(true); // Ensure modal stays open on error
    } finally {
      setIsLoading(false);
    }
  };

  // Main effect to check the room's status on initial load
  useEffect(() => {
    // Stage 1: Check if the room is public or private

    fetch(`${API_URL}/api/codespaces/${spaceName}/status`)
      .then(res => {
        if (!res.ok) throw new Error('Codespace not found.');
        return res.json();
      })
      .then(data => {
        if (data.isPublic) {
          // If public, fetch data immediately without a passcode.
          fetchCodeSpaceData(null);
        } else {
          // If private, stop loading and show the auth modal.
          setIsLoading(false);
          setShowAuthModal(true);
        }
      })
      .catch(err => {
        console.error(err);
        navigate('/'); // If the room doesn't exist, redirect to the homepage.
      });

    // Cleanup socket on component unmount
    return () => {
      socketRef.current?.disconnect();
    };
  }, [spaceName, navigate]);

  const activeFileRef = useRef(activeFile);
  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  // Helper function to attach all socket event listeners
  const initializeSocketListeners = (socket) => {
    socket.on('code-updated', ({ file: updatedFileName, content }) => {
      setFiles(prev => prev.map(f => f.name === updatedFileName ? { ...f, content } : f));
      setOpenFiles(prev => prev.map(f => f.name === updatedFileName ? { ...f, content } : f));
      if (activeFileRef.current?.name === updatedFileName) {
        setActiveFile(prev => ({ ...prev, content }));
      }
    });

    socket.on('file-created', (newFileList) => setFiles(newFileList));

    socket.on('file-deleted', ({ fileName, files: updatedFiles }) => {
      // Update files list with the new file list from server
      setFiles(updatedFiles);

      // Remove from open tabs if it was open
      setOpenFiles(prev => prev.filter(f => f.name !== fileName));

      // If the deleted file was active, switch to another open file or null
      setActiveFile(prev => {
        if (prev?.name === fileName) {
          const remainingOpenFiles = openFiles.filter(f => f.name !== fileName);
          return remainingOpenFiles.length > 0 ? remainingOpenFiles[0] : null;
        }
        return prev;
      });
    });

    socket.on('privacy-updated', ({ isPublic }) => setIsPublic(isPublic));
  };
  const handleDelete = async (file) => {
    try {
      const res = await fetch(`${API_URL}/api/codespaces/${spaceName}/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error(data.msg || "Error deleting file");
        return;
      }

      // ✅ Update files in explorer
      setFiles(prev => prev.filter(f => f.name !== file));

      // ✅ Remove from open tabs
      setOpenFiles(prev => prev.filter(f => f.name !== file));

      // ✅ If active file is deleted → switch to another opened file
      setActiveFile(prev =>
        prev && prev.name === file
          ? null
          : prev
      );

    } catch (error) {
      console.error("Error:", error);
    }
  };

  // --- All other handler functions ---
  const handleFileSelect = (file) => {
    const isOpen = openFiles.some(f => f.name === file.name);
    if (!isOpen) setOpenFiles(prev => [...prev, file]);
    setActiveFile(file);
  };

  const handleTabClick = (file) => setActiveFile(file);

  const handleTabClose = (fileName) => {
    const closingTabIndex = openFiles.findIndex(f => f.name === fileName);
    const newOpenFiles = openFiles.filter(f => f.name !== fileName);
    setOpenFiles(newOpenFiles);

    if (activeFile?.name === fileName) {
      let nextActiveFile = null;
      if (newOpenFiles.length > 0) {
        const newIndex = Math.max(0, closingTabIndex - 1);
        nextActiveFile = newOpenFiles[newIndex];
      }
      setActiveFile(nextActiveFile);
    }
  };

  const handleCreateFile = (fileName) => {
    let finalFileName = fileName;
    if (!fileName.includes('.')) finalFileName += '.txt';
    if (files.some(f => f.name === finalFileName)) {
      alert('A file with this name already exists.');
      return;
    }
    const language = finalFileName.split('.').pop() || 'plaintext';
    socketRef.current?.emit('create-file', { spaceName, fileName: finalFileName, language });
  };

  const onCodeChange = (newCode) => {
    if (!activeFile) return;
    setActiveFile(prev => ({ ...prev, content: newCode }));
    if (socketRef.current) {
      socketRef.current.emit('code-change', { spaceName, file: activeFile.name, content: newCode });
    }
  };

  const handleToggleTerminal = () => setIsTerminalOpen(prev => !prev);
  const handleTogglePrivacy = () => { if (isPublic) setIsSetPrivacyModalOpen(true); else updatePrivacySettings(true, null); };

  const handleRunCode = () => {
    if (activeFile?.language !== 'js') {
      alert('Run is only available for JavaScript files.');
      return;
    }
    if (!isTerminalOpen) setIsTerminalOpen(true);
    if (terminalComponentRef.current) {
      terminalComponentRef.current.runCode(activeFile.content);
    }
  };

  const updatePrivacySettings = async (newIsPublic, passcode) => {
    try {
      const res = await fetch(`${API_URL}/api/codespaces/${spaceName}/privacy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: newIsPublic, passcode }),
      });
      const data = await res.json();

      setIsPublic(data.isPublic);
      socketRef.current?.emit('privacy-change', { spaceName, ...data });
      setIsSetPrivacyModalOpen(false);
    } catch (error) {
      console.error("Failed to update privacy settings:", error);
    }
  };

  // --- Render Logic ---

  // If data hasn't been loaded yet, show the authorization flow.
  if (!isDataLoaded) {
    return (
      <>
        {showAuthModal ? (
          <JoinPrivateModal
            spaceName={spaceName}
            onVerify={fetchCodeSpaceData}
            onCancel={() => navigate('/')}
            error={authError}
            isLoading={isLoading}
          />
        ) : (
          <div className="flex items-center justify-center h-screen bg-gray-900 text-xl text-gray-400">
            Authorizing...
          </div>
        )}
      </>
    );
  }

  // Main application UI, rendered only after successful authorization
  return (
    <>
      {isSetPrivacyModalOpen && (
        <PasscodeModal
          onSetPasscode={(passcode) => updatePrivacySettings(false, passcode)}
          onCancel={() => setIsSetPrivacyModalOpen(false)}
        />
      )}
      <div className="flex h-screen w-full bg-gray-800">
        <div className="w-1/6 overflow-y-auto">
          <FileExplorer files={files} onFileSelect={handleFileSelect} activeFile={activeFile} onDeleteFile={handleDelete} onCreateFile={handleCreateFile} />
        </div>
        <div className="flex flex-col w-5/6">
          <TabBar
            openFiles={openFiles}
            activeFile={activeFile}
            onTabClick={handleTabClick}
            onTabClose={handleTabClose}
            onRunCode={handleRunCode}
            isPublic={isPublic}
            onTogglePrivacy={handleTogglePrivacy}
            isTerminalOpen={isTerminalOpen}
            onToggleTerminal={handleToggleTerminal}
          />
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 bg-gray-900 overflow-hidden">
              {activeFile ? (
                <Editor
                  key={activeFile.name}
                  language={activeFile.language}
                  value={activeFile.content}
                  onChange={onCodeChange}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Select a file from the explorer to begin coding.
                </div>
              )}
            </div>
            <div className={`transition-all duration-300 ease-in-out border-t border-gray-700 ${isTerminalOpen ? 'h-1/3' : 'h-0'}`}>
              {isTerminalOpen && <Terminal ref={terminalComponentRef} socket={socketRef.current} spaceName={spaceName} />}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default CodeSpacePage;