import { useState } from "react";
import { login, register } from "../api/client";

export default function LoginForm({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [userid, setUserid] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      if (mode === "register") {
        if (password !== confirmPassword) {
          throw new Error("비밀번호가 일치하지 않습니다.");
        }
        await register(userid, password);
        setMessage("회원가입 완료! 로그인해 주세요.");
        setMode("login");
      } else {
        await login(userid, password);
        onLogin(userid);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <h1>SmartDigest</h1>
      <p className="auth-subtitle">지식 자산 창고</p>

      <div className="auth-tabs">
        <button
          type="button"
          className={mode === "login" ? "active" : ""}
          onClick={() => setMode("login")}
        >
          로그인
        </button>
        <button
          type="button"
          className={mode === "register" ? "active" : ""}
          onClick={() => setMode("register")}
        >
          회원가입
        </button>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        <label>
          아이디
          <input
            value={userid}
            onChange={(e) => setUserid(e.target.value)}
            minLength={3}
            required
          />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {mode === "register" && (
          <label>
            비밀번호 확인
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "처리 중..." : mode === "login" ? "접속하기" : "회원가입"}
        </button>
      </form>
    </div>
  );
}
