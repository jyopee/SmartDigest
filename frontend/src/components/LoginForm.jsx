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
      <div className="auth-card-glow" aria-hidden="true" />

      <header className="auth-brand">
        <div className="auth-brand-mark" aria-hidden="true">
          SD
        </div>
        <div className="auth-brand-copy">
          <h1>SmartDigest</h1>
          <p className="auth-subtitle">지식 자산 창고</p>
        </div>
      </header>

      <div className="auth-tabs" role="tablist" aria-label="인증 방식">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={mode === "login" ? "active" : ""}
          onClick={() => setMode("login")}
        >
          로그인
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={mode === "register" ? "active" : ""}
          onClick={() => setMode("register")}
        >
          회원가입
        </button>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        <label className="auth-field">
          <span className="auth-field-label">아이디</span>
          <input
            value={userid}
            onChange={(e) => setUserid(e.target.value)}
            minLength={3}
            required
            autoComplete="username"
            placeholder="아이디를 입력하세요"
          />
        </label>
        <label className="auth-field">
          <span className="auth-field-label">비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            placeholder="비밀번호를 입력하세요"
          />
        </label>
        {mode === "register" && (
          <label className="auth-field">
            <span className="auth-field-label">비밀번호 확인</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="비밀번호를 다시 입력하세요"
            />
          </label>
        )}
        {error && <p className="form-error auth-feedback">{error}</p>}
        {message && <p className="form-success auth-feedback">{message}</p>}
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? "처리 중..." : mode === "login" ? "접속하기" : "회원가입"}
        </button>
      </form>

      <p className="auth-footnote">
        문서를 업로드하고 AI 요약·주석·학습 대시보드로 이어집니다.
      </p>
    </div>
  );
}
