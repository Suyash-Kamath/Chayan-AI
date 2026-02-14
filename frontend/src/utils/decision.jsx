export function extractDecision(result) {
  if (result.decision && result.decision !== "-") {
    if (result.decision.includes("Shortlist")) {
      return <span className="badge badge-success">Shortlisted</span>;
    }
    if (result.decision.includes("Reject")) {
      return <span className="badge badge-danger">Rejected</span>;
    }
    return <span className="badge badge-neutral">{result.decision}</span>;
  }
  if (result.result_text) {
    const match = result.result_text.match(/Decision:\s*(Shortlist|Reject)/);
    if (match) {
      return match[1] === "Shortlist" ? (
        <span className="badge badge-success">Shortlisted</span>
      ) : (
        <span className="badge badge-danger">Rejected</span>
      );
    }
  }
  if (result.error) return <span className="badge badge-danger">Error</span>;
  return "-";
}
