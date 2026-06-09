export default function DocumentMinimap({ data }) {
  if (!data?.totalLines) return null;

  return (
    <div className="document-minimap" aria-label="문서 구분 미니맵">
      <div className="document-minimap-header">
        <span>문서 구조</span>
        <span className="document-minimap-meta">
          {data.totalLines}줄 · 가상 {data.virtualPageCount}구간
          {data.splitPoints.length > 0 && ` · 구분 ${data.splitPoints.length}곳`}
        </span>
      </div>

      <div className="document-minimap-bar">
        {data.segments.map((segment) => (
          <div
            key={`segment-${segment.startLine}`}
            className="document-minimap-segment"
            style={{ flexGrow: segment.lineCount, flexBasis: 0 }}
            title={`구간 ${segment.pageNumber}: ${segment.lineCount}줄`}
          />
        ))}

        {data.markers.map((marker) => (
          <span
            key={`marker-${marker.lineIndex}`}
            className="document-minimap-marker"
            style={{ left: `${marker.ratio * 100}%` }}
            title={`${marker.label}에서 구분`}
          />
        ))}
      </div>
    </div>
  );
}
