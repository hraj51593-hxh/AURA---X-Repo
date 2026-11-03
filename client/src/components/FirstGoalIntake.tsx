import { useEffect, useRef, useState } from "react";
import { useAuriVoice } from "@/hooks/useAuriVoice";

export type FirstGoalAnswers = {
  title: string;
  description: string;
  skillLevel: string;
  previousExperience: string;
  minutesPerDay: string;
  durationDays: string;
  learningStyle: string;
  budgetPreference: string;
  constraints: string;
  successCriteria: string;
};

type AnswerKey = keyof FirstGoalAnswers;

const STEPS = [
  { title: "Your goal", question: "What outcome do you want to achieve?" },
  { title: "Your starting point", question: "What is your current skill level, and have you tried this before?" },
  { title: "Daily time", question: "How many minutes can you realistically spend each day?" },
  { title: "Timeline", question: "How long would you like to work toward this goal?" },
  { title: "Learning style", question: "How do you prefer to learn?" },
  { title: "Budget", question: "What is your budget preference for learning resources?" },
  { title: "Constraints", question: "What constraints or preferences should Auri account for?" },
  { title: "Success criteria", question: "What observable result would show you have made progress?" },
] as const;

const emptyAnswers: FirstGoalAnswers = {
  title: "",
  description: "",
  skillLevel: "",
  previousExperience: "",
  minutesPerDay: "",
  durationDays: "",
  learningStyle: "",
  budgetPreference: "",
  constraints: "",
  successCriteria: "",
};

export default function FirstGoalIntake({
  onComplete,
  onClose,
}: {
  onComplete: (answers: FirstGoalAnswers) => void;
  onClose: () => void;
}) {
  const [answers, setAnswers] = useState<FirstGoalAnswers>(emptyAnswers);
  const answersRef = useRef(answers);
  const dictationKey = useRef<AnswerKey | null>(null);
  const dictationPrefix = useRef("");
  const [step, setStep] = useState(0);
  const voice = useAuriVoice();
  const current = STEPS[step];
  const progress = ((step + 1) / STEPS.length) * 100;

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    const key = dictationKey.current;
    if (!key || !voice.transcript) return;
    const prefix = dictationPrefix.current;
    const separator = prefix.trim() ? " " : "";
    setAnswers(previous => ({ ...previous, [key]: `${prefix}${separator}${voice.transcript}` }));
  }, [voice.transcript]);

  useEffect(() => {
    if (voice.status !== "listening" && dictationKey.current) dictationKey.current = null;
  }, [voice.status]);

  function updateAnswer(key: AnswerKey, value: string) {
    setAnswers(previous => ({ ...previous, [key]: value }));
  }

  function startDictation(key: AnswerKey) {
    if (voice.status === "listening") {
      voice.stopListening();
      dictationKey.current = null;
      return;
    }
    dictationPrefix.current = answersRef.current[key];
    dictationKey.current = key;
    voice.resetTranscript();
    voice.startListening();
  }

  function voiceControl(key: AnswerKey) {
    const isListeningHere = voice.status === "listening" && dictationKey.current === key;
    return (
      <button
        className="btn btn-secondary"
        type="button"
        onClick={() => startDictation(key)}
        disabled={!voice.recognitionAvailable || (voice.status === "listening" && !isListeningHere)}
        aria-label={isListeningHere ? "Stop dictation" : "Dictate this answer"}
      >
        {isListeningHere ? "Stop microphone" : "Use microphone"}
      </button>
    );
  }

  function textAnswer(
    key: AnswerKey,
    label: string,
    options: { placeholder?: string; rows?: number; required?: boolean; maxLength?: number } = {}
  ) {
    return (
      <label className="field">
        {label}
        {options.rows ? (
          <textarea
            value={answers[key]}
            onChange={event => updateAnswer(key, event.target.value)}
            placeholder={options.placeholder}
            rows={options.rows}
            maxLength={options.maxLength ?? 3000}
            required={options.required}
          />
        ) : (
          <input
            type="text"
            value={answers[key]}
            onChange={event => updateAnswer(key, event.target.value)}
            placeholder={options.placeholder}
            maxLength={options.maxLength ?? 3000}
            required={options.required}
          />
        )}
        {voiceControl(key)}
      </label>
    );
  }

  function handleComplete() {
    onComplete({ ...answersRef.current });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal aura-modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-goal-intake-title"
        aria-describedby="first-goal-intake-intro"
      >
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close first-goal interview">
          ×
        </button>
        <div className="modal-symbol" aria-hidden="true">✳</div>
        <p className="eyebrow">AURI · FIRST-GOAL INTERVIEW</p>
        <h2 id="first-goal-intake-title">Let’s shape your first goal</h2>
        <p id="first-goal-intake-intro" className="muted">
          I’ll ask a few questions, then you can review and edit everything before anything is saved.
        </p>

        <div className="aura-section" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          <p className="muted">Step {step + 1} of {STEPS.length} · {current.title}</p>
          <progress
            value={step + 1}
            max={STEPS.length}
            aria-label="Interview progress"
            style={{ width: "100%" }}
          />
        </div>
        <div className="aura-section" aria-live="polite">
          <h3>{current.question}</h3>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => voice.status === "speaking" ? voice.stopSpeaking() : voice.speak(current.question)}
            disabled={!voice.speechAvailable}
          >
            {voice.status === "speaking" ? "Stop speaking" : "Hear this question"}
          </button>
          {voice.errorMessage && <p className="aura-muted" role="status">{voice.errorMessage}</p>}
        </div>

        <div className="stack-form aura-section">
          {step === 0 && (
            <div className="aura-form-grid">
              <div className="field wide">
                {textAnswer("title", "Give your goal a short title", {
                  placeholder: "e.g. Build a portfolio-ready data visualization",
                  required: true,
                  maxLength: 160,
                })}
              </div>
              <div className="field wide">
                {textAnswer("description", "Describe the outcome and why it matters", {
                  placeholder: "What would you like to be able to do or create?",
                  rows: 3,
                  required: true,
                  maxLength: 5000,
                })}
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="aura-form-grid">
              <label className="field">
                Current skill level
                <select value={answers.skillLevel} onChange={event => updateAnswer("skillLevel", event.target.value)}>
                  <option value="">Choose or skip</option>
                  <option>Beginner</option>
                  <option>Some experience</option>
                  <option>Intermediate</option>
                  <option>Advanced</option>
                </select>
              </label>
              <div className="field wide">
                {textAnswer("previousExperience", "Have you tried this before? What happened?", {
                  placeholder: "Share any attempts, experience, or write ‘not yet’.",
                  rows: 3,
                  maxLength: 3000,
                })}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="aura-form-grid">
              <label className="field">
                Available minutes per day
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={answers.minutesPerDay}
                  onChange={event => updateAnswer("minutesPerDay", event.target.value)}
                  placeholder="e.g. 30"
                />
                {voiceControl("minutesPerDay")}
              </label>
            </div>
          )}
          {step === 3 && (
            <div className="aura-form-grid">
              <label className="field">
                Target duration (up to 730 days / 2 years)
                <input
                  type="number"
                  min={1}
                  max={730}
                  value={answers.durationDays}
                  onChange={event => updateAnswer("durationDays", event.target.value)}
                  placeholder="e.g. 60"
                />
                {voiceControl("durationDays")}
              </label>
              <p className="aura-muted">You can also enter a number using the microphone, for example “sixty days” or “two years.”</p>
            </div>
          )}
          {step === 4 && (
            <div className="aura-form-grid">
              <label className="field">
                Preferred learning style
                <select value={answers.learningStyle} onChange={event => updateAnswer("learningStyle", event.target.value)}>
                  <option value="">Choose or skip</option>
                  <option>Self-paced mixed learning</option>
                  <option>Reading and notes</option>
                  <option>Video lessons</option>
                  <option>Hands-on practice</option>
                  <option>Projects first</option>
                  <option>Structured lessons</option>
                </select>
              </label>
              <div className="field">
                <span>Or say your own preference</span>
                {voiceControl("learningStyle")}
              </div>
            </div>
          )}
          {step === 5 && (
            <div className="aura-form-grid">
              <label className="field">
                Budget preference
                <select value={answers.budgetPreference} onChange={event => updateAnswer("budgetPreference", event.target.value)}>
                  <option value="">Choose or skip</option>
                  <option>Prefer free resources</option>
                  <option>Free only</option>
                  <option>Some paid resources are okay</option>
                  <option>Budget not a constraint</option>
                </select>
              </label>
              <div className="field">
                <span>Or say your own preference</span>
                {voiceControl("budgetPreference")}
              </div>
            </div>
          )}
          {step === 6 && textAnswer("constraints", "Constraints or preferences", {
            placeholder: "Schedule, prerequisites, accessibility, equipment, or anything else to account for.",
            rows: 4,
          })}
          {step === 7 && textAnswer("successCriteria", "Observable success criteria", {
            placeholder: "What could you demonstrate, complete, or measure?",
            rows: 4,
          })}
        </div>

        {voice.status === "listening" && <p className="aura-muted" role="status">Listening… You can keep typing or stop the microphone.</p>}
        <div className="aura-section" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "space-between" }}>
          <button className="btn btn-ghost" type="button" onClick={() => setStep(index => Math.max(0, index - 1))} disabled={step === 0}>
            Back
          </button>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
            <button className="btn btn-secondary" type="button" onClick={() => step === STEPS.length - 1 ? handleComplete() : setStep(index => Math.min(STEPS.length - 1, index + 1))}>
              Skip this question
            </button>
            {step === STEPS.length - 1 ? (
              <button className="btn btn-primary" type="button" onClick={handleComplete}>Review answers</button>
            ) : (
              <button className="btn btn-primary" type="button" onClick={() => setStep(index => Math.min(STEPS.length - 1, index + 1))}>Next</button>
            )}
          </div>
        </div>
        <p className="aura-muted">Your answers stay in this page until you review and save the goal.</p>
      </section>
    </div>
  );
}
