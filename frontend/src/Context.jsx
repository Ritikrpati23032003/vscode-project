import { createContext, useContext, useState } from "react";

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  // Same-origin URLs (Nginx reverse proxy)
  const SOCKET_URL = "http://3.85.118.200:5000";
  const API_URL = "http://3.85.118.200:5000/api";

  const [verified, setVerified] = useState(false);

  const value = {
    SOCKET_URL,
    API_URL,
    verified,
    setVerified,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error("useAppContext must be used inside AppProvider");
  }

  return context;
};
