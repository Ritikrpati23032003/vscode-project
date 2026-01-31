const Codespace = require('../models/codeSpace');
// NOTE: Running arbitrary code is a HUGE security risk.
// This is a simplified example. In production, use Docker or a similar sandboxing technology.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const initializeSocket = (io) => {
    io.on('connection', (socket) => {
        // console.log(`User connected: ${socket.id}`);

        socket.on('join-space', async ({ spaceName }) => {
            socket.join(spaceName);
            // console.log(`${socket.id} joined space: ${spaceName}`);
            // Let others in the room know a new user has joined
            socket.to(spaceName).emit('user-joined', { userId: socket.id });
        });

        // Listen for code changes from a client
        socket.on('code-change', ({ spaceName, file, content }) => {
            // Broadcast the changes to all other clients in the same room (space)
            socket.to(spaceName).emit('code-updated', { file, content });

            // Debounce this in a real app to avoid excessive DB writes
            Codespace.updateOne(
                { name: spaceName, 'files.name': file },
                { $set: { 'files.$.content': content } }
            ).catch(err => console.error("DB update failed:", err));
        });

        // Listen for new file creation
        socket.on('create-file', async ({ spaceName, fileName, language }) => {
            const newFile = { name: fileName, language, content: '' };
            const updatedCodespace = await Codespace.findOneAndUpdate(
                { name: spaceName },
                { $push: { files: newFile } },
                { new: true }
            );

            if (updatedCodespace) {
                // Notify all clients in the room about the new file
                io.to(spaceName).emit('file-created', updatedCodespace.files);
            }
        });

        // Listen for file deletion
        socket.on('delete-file', async ({ spaceName, fileName }) => {
            const updatedCodespace = await Codespace.findOneAndUpdate(
                { name: spaceName },
                { $pull: { files: { name: fileName } } },
                { new: true }
            );

            if (updatedCodespace) {
                // Notify all clients in the room about the file deletion
                io.to(spaceName).emit('file-deleted', { fileName, files: updatedCodespace.files });
            }
        });

        socket.on('privacy-change', ({ spaceName, isPublic, hasPasscode }) => {
            // Broadcast the change to everyone in the room
            socket.to(spaceName).emit('privacy-updated', { isPublic, hasPasscode });
        });

        // Listen for a file being closed
        socket.on('file-close', ({ spaceName, fileName }) => {
            // Broadcast which file was closed
            socket.to(spaceName).emit('file-closed', { fileName });
        });

        // Handle terminal commands (SIMPLIFIED & INSECURE EXAMPLE)
        socket.on('terminal-command', ({ spaceName, command }) => {
            // For a real app, you MUST sandbox this. Create a temp dir, write files, then exec.
            const [cmd, ...args] = command.split(' ');

            // Whitelist safe commands
            if (!['node', 'python'].includes(cmd)) {
                socket.emit('terminal-output', 'Error: Command not allowed.');
                return;
            }

            const proc = spawn(cmd, args);
            proc.stdout.on('data', (data) => {
                socket.emit('terminal-output', data.toString());
            });
            proc.stderr.on('data', (data) => {
                socket.emit('terminal-output', `ERROR: ${data.toString()}`);
            });
            proc.on('close', (code) => {
                socket.emit('terminal-output', `Process exited with code ${code}`);
            });
        });

        socket.on('disconnect', () => {
            // console.log(`User disconnected: ${socket.id}`);
        });
    });
};

module.exports = initializeSocket;