import { useState } from "react";

type LoginProps = {
  onLogin: (token: string) => Promise<void>;
  checking: boolean;
  error: string;
};

export const Login = ({ onLogin, checking, error }: LoginProps) => {
  const [input, setInput] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) onLogin(input.trim());
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg)" }}>
      <form onSubmit={submit} style={{ width: 360 }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, letterSpacing: "-.03em" }}>
            ETH RPC Relay<span className="tag" style={{ fontSize: ".55rem", padding: ".12rem .35rem", borderRadius: 3, background: "var(--accent)", color: "#fff", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", marginLeft: ".5rem" }}>Admin</span>
          </h1>
        </div>
        <div className="card" style={{ padding: "1.5rem" }}>
          <div className="form-group">
            <label>Admin Token</label>
            <input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter admin token..."
              autoFocus
              disabled={checking}
            />
          </div>
          {error && <div style={{ fontSize: ".75rem", color: "var(--red)", marginBottom: ".8rem" }}>{error}</div>}
          <button className="btn-primary" type="submit" style={{ width: "100%" }} disabled={checking || !input.trim()}>
            {checking ? "Verifying..." : "Sign In"}
          </button>
        </div>
      </form>
    </div>
  );
};
