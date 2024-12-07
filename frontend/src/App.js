import React, { useState, useEffect } from "react";
import axios from "axios";

function App() {
  const [userEmail, setUserEmail] = useState("");
  const [tokens, setTokens] = useState(null);

  const handleLogin = async () => {
    try {
      const response = await axios.get("http://localhost:5000/api/oauth/login");
      window.location.href = response.data.authUrl;
    } catch (error) {
      console.error("Error fetching auth URL:", error);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code) {
      axios.get(`http://localhost:5000/api/oauth/callback?code=${code}`)
        .then(response => {
          const { email, tokens } = response.data;
          setUserEmail(email);
          setTokens(tokens);
          window.history.pushState({}, null, '/');
        })
        .catch(error => {
          console.error("Error handling OAuth callback:", error);
        });
    }
  }, []);

  useEffect(() => {
    if (tokens) {
      fetchFilteredEmails();
    }
  }, [tokens]);

  const fetchFilteredEmails = async () => {
    if (tokens) {
      try {
        const response = await axios.get("http://localhost:5000/api/emails", {
          params: { tokens },
        });
        console.log("Filtered Emails:", response.data);
      } catch (error) {
        console.error("Error fetching filtered emails:", error);
      }
    }
  };

  return (
    <div>
      <h1>LinkedIn Wrap of the Year</h1>
      {!userEmail ? (
        <button onClick={handleLogin}>Login with Google</button>
      ) : (
        <h2>Welcome, {userEmail}!</h2>
      )}
    </div>
  );
}

export default App;
