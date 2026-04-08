import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE, APP_DESC, STORAGE_KEYS } from "../followupConfig";
import { postJSONWithRetry } from "./surveyUtils";

const GATE_MAX_ATTEMPTS = 10;
const GATE_TIMEOUT_MS = 3000;

function friendlyGateError(error: any) {
  const message = String(error?.message || "").trim();
  if (!message || message.toLowerCase() === "failed to fetch" || message === "Request timed out") {
    return `We could not reach the server after ${GATE_MAX_ATTEMPTS} attempts. Please wait a moment and try again.`;
  }
  return `Error: ${message}`;
}

function GatePage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEYS.token) || "");
  const [participantId, setParticipantId] = useState(() => localStorage.getItem(STORAGE_KEYS.participantId) || "");
  const [step, setStep] = useState<"code" | "profile">(() => {
    const savedToken = localStorage.getItem(STORAGE_KEYS.token);
    const savedParticipantId = localStorage.getItem(STORAGE_KEYS.participantId);
    return savedToken && savedParticipantId ? "profile" : "code";
  });
  const [profile, setProfile] = useState({
    name: "",
    email: "",
    job_title: "",
    institution: "",
    latest_degree: "",
    years_experience: "",
  });

  useEffect(() => {
    const savedToken = localStorage.getItem(STORAGE_KEYS.token);
    const savedParticipantId = localStorage.getItem(STORAGE_KEYS.participantId);
    const done = localStorage.getItem(STORAGE_KEYS.profileDone) === "1";
    if (savedToken && savedParticipantId && done) navigate("/survey", { replace: true });
    if (savedToken && savedParticipantId && !done) setStep("profile");
  }, [navigate]);

  async function startSurvey() {
    try {
      setSubmitting(true);
      setStatus("Checking access code...");
      const email = profile.email.trim();
      const result = await postJSONWithRetry(
        `${API_BASE}/start`,
        {
          code,
          email: email || undefined,
        },
        {
          maxAttempts: GATE_MAX_ATTEMPTS,
          timeoutMs: GATE_TIMEOUT_MS,
          onRetry: ({ nextAttempt, maxAttempts }) => {
            setStatus(`Checking access code. Connection is slow, retrying automatically (${nextAttempt}/${maxAttempts})...`);
          },
        }
      );
      localStorage.setItem(STORAGE_KEYS.token, String(result.token));
      localStorage.setItem(STORAGE_KEYS.participantId, String(result.participant_id));
      setToken(String(result.token));
      setParticipantId(String(result.participant_id));
      if (result?.prefill_email && typeof result.prefill_email === "string") {
        setProfile((current) => ({ ...current, email: result.prefill_email }));
      }

      if (result?.resumed) {
        localStorage.setItem(STORAGE_KEYS.profileDone, "1");
        setStatus("Resume found. Redirecting to your survey...");
        navigate("/survey", { replace: true });
        return;
      }

      localStorage.removeItem(STORAGE_KEYS.profileDone);
      setStep("profile");
      setStatus(
        email
          ? "Access granted. We did not find an existing session for that email, so please complete your details to continue."
          : "Access granted. Please complete your details to continue."
      );
    } catch (error: any) {
      setStatus(friendlyGateError(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitProfile() {
    try {
      if (!token || !participantId) throw new Error("Missing session. Please enter your access code again.");

      const years = Number(profile.years_experience);
      if (!profile.name.trim()) throw new Error("Please provide your name.");
      if (!profile.email.trim()) throw new Error("Please provide your email.");
      if (!profile.job_title.trim()) throw new Error("Please provide your job title.");
      if (!profile.institution.trim()) throw new Error("Please provide your institution.");
      if (!profile.latest_degree.trim()) throw new Error("Please provide your latest degree.");
      if (!Number.isFinite(years) || years < 0 || years > 80) throw new Error("Please provide a valid number of experience years.");

      setSubmitting(true);
      setStatus("Saving your details...");
      const result = await postJSONWithRetry(
        `${API_BASE}/profile`,
        {
          token,
          profile: {
            name: profile.name.trim(),
            email: profile.email.trim(),
            job_title: profile.job_title.trim(),
            institution: profile.institution.trim(),
            latest_degree: profile.latest_degree.trim(),
            years_experience: years,
          },
        },
        {
          maxAttempts: GATE_MAX_ATTEMPTS,
          timeoutMs: GATE_TIMEOUT_MS,
          onRetry: ({ nextAttempt, maxAttempts }) => {
            setStatus(`Saving your details. Connection is slow, retrying automatically (${nextAttempt}/${maxAttempts})...`);
          },
        }
      );

      if (result?.token) {
        localStorage.setItem(STORAGE_KEYS.token, String(result.token));
        setToken(String(result.token));
      }
      if (result?.participant_id) {
        localStorage.setItem(STORAGE_KEYS.participantId, String(result.participant_id));
        setParticipantId(String(result.participant_id));
      }

      localStorage.setItem(STORAGE_KEYS.profileDone, "1");
      navigate("/survey", { replace: true });
    } catch (error: any) {
      setStatus(friendlyGateError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app">
      <div className="container narrow">
        <div className="card">
          <div className="title">TOPA Expert Survey</div>
          <div className="intro" dangerouslySetInnerHTML={{ __html: APP_DESC }} />

          {step === "code" ? (
            <>
              <div className="noteBox">
                <b>Returning ?</b> Enter the same email you used before together with your access code, and we will restore your survey.
              </div>
              <form
                className="formRow"
                onSubmit={(event) => {
                  event.preventDefault();
                  void startSurvey();
                }}
              >
                <input className="input" placeholder="Access code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" />
                <input
                  className="input"
                  type="email"
                  placeholder="Email (optional for new participants, required to resume)"
                  value={profile.email}
                  onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))}
                  autoComplete="email"
                />
                <button className="btn btnPrimary" type="submit" disabled={!code || submitting}>
                  {submitting ? "Starting..." : "Start"}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="noteBox">
                <b>Participant details</b> are required and will be stored together with your survey responses.
              </div>
              <form
                className="formGrid"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitProfile();
                }}
              >
                <input className="input" placeholder="Full name" value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} />
                <input className="input" placeholder="Email" value={profile.email} onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))} />
                <input className="input" placeholder="Job title" value={profile.job_title} onChange={(event) => setProfile((current) => ({ ...current, job_title: event.target.value }))} />
                <input className="input" placeholder="Institution" value={profile.institution} onChange={(event) => setProfile((current) => ({ ...current, institution: event.target.value }))} />
                <input className="input" placeholder="Latest degree" value={profile.latest_degree} onChange={(event) => setProfile((current) => ({ ...current, latest_degree: event.target.value }))} />
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={80}
                  step={1}
                  placeholder="Years of experience"
                  value={profile.years_experience}
                  onChange={(event) => setProfile((current) => ({ ...current, years_experience: event.target.value }))}
                />
                <div className="formActions">
                  <button className="btn btnPrimary" type="submit" disabled={submitting}>
                    {submitting ? "Saving..." : "Continue to survey"}
                  </button>
                  <button
                    className="btn"
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      localStorage.removeItem(STORAGE_KEYS.token);
                      localStorage.removeItem(STORAGE_KEYS.participantId);
                      localStorage.removeItem(STORAGE_KEYS.profileDone);
                      localStorage.removeItem(STORAGE_KEYS.responses);
                      setToken("");
                      setParticipantId("");
                      setStep("code");
                    }}
                  >
                    Restart
                  </button>
                </div>
              </form>
            </>
          )}

          {status && <div className="status">{status}</div>}
        </div>
      </div>
    </div>
  );
}

export default GatePage;
