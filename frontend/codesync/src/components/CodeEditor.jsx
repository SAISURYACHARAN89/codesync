import React, { useState } from "react";
import MonacoEditor from "react-monaco-editor";

const CodeEditor = ({ roomId, onRunCode }) => {
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("python"); // Default language

  const handleRunCode = () => {
    onRunCode(code, language);
  };

  return (
    <div>
      <div>
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="python">Python</option>
          <option value="cpp">C++</option>
          <option value="java">Java</option>
        </select>
        <button onClick={handleRunCode}>Run</button>
      </div>
      <MonacoEditor
        width="800"
        height="600"
        language={language}
        theme="vs-dark"
        value={code}
        onChange={(newCode) => setCode(newCode)}
      />
    </div>
  );
};

export default CodeEditor;
