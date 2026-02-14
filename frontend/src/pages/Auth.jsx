function Auth({
  authMode,
  setAuthMode,
  handleLogin,
  handleRegister,
  handleForgotPassword,
  handleResetPassword,
  loading,
  username,
  setUsername,
  password,
  setPassword,
  email,
  setEmail,
}) {
  return (
    <div className="login-layout">
      <div className="login-card">
        <h1 className="login-title">ProHire</h1>
        <p className="login-subtitle">
          Apply karo chahe kahin se, shortlisting hoga yahin se.
        </p>

        {authMode === "login" ? (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <input
                className="form-input"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <input
                className="form-input"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? "Logging in..." : "Login"}
            </button>
            <div className="auth-actions">
              <button type="button" className="auth-link" onClick={() => setAuthMode("register")}>
                Need an account? Register
              </button>
              <button
                type="button"
                className="auth-link"
                onClick={() => setAuthMode("forgot-password")}
              >
                Forgot Password?
              </button>
            </div>
          </form>
        ) : authMode === "register" ? (
          <form onSubmit={handleRegister}>
            <div className="form-group">
              <input
                className="form-input"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <input
                className="form-input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <input
                className="form-input"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? "Registering..." : "Register"}
            </button>
            <button
              type="button"
              className="auth-link auth-switch"
              onClick={() => setAuthMode("login")}
            >
              Already have an account? Login
            </button>
          </form>
        ) : authMode === "forgot-password" ? (
          <form onSubmit={handleForgotPassword}>
            <div className="form-group">
              <input
                className="form-input"
                type="email"
                placeholder="Enter your registered email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? "Sending Link..." : "Send Reset Link"}
            </button>
            <button type="button" className="auth-back-link" onClick={() => setAuthMode("login")}>
              Back to Login
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword}>
            <div className="form-group">
              <input
                className="form-input"
                type="password"
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
              {loading ? "Resetting..." : "Reset Password"}
            </button>
            <button type="button" className="auth-back-link" onClick={() => setAuthMode("login")}>
              Back to Login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default Auth;
