const LOGO_SRC = "/logo.png";

export default function AppLogo({
  size = 36,
  variant = "mark",
  className = "",
  showText = false,
  title = "SmartDigest",
  subtitle = "",
}) {
  const isBanner = variant === "banner";

  return (
    <div
      className={`app-logo-wrap app-logo-wrap--${variant}${
        className ? ` ${className}` : ""
      }`}
    >
      <div className="app-logo-frame">
        <img
          src={LOGO_SRC}
          alt={title}
          className="app-logo-image"
          width={isBanner ? undefined : size}
          height={isBanner ? undefined : size}
          style={
            isBanner
              ? undefined
              : { height: size, width: "auto", maxWidth: Math.round(size * 3.2) }
          }
          decoding="async"
        />
      </div>
      {showText && (
        <div className="app-logo-copy">
          <span className="app-logo-title">{title}</span>
          {subtitle ? <span className="app-logo-subtitle">{subtitle}</span> : null}
        </div>
      )}
    </div>
  );
}
