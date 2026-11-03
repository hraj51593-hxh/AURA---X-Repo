import { useState } from "react";
import type { FirstGoalAnswers } from "@/components/FirstGoalIntake";
import { addDateOnlyDays } from "@shared/goal-dates";

export type GoalCreationValues = {
  title: string;
  description: string;
  category: string;
  skillLevel: string;
  durationDays: number;
  startDate: string;
  minutesPerDay: number;
  successCriteria: string;
  constraints: string;
  previousExperience: string;
  learningStyle: string;
  budgetPreference: string;
};

const localDay = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dateLabel = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
};
const learningChoices = ["Self-paced mixed learning", "Reading and notes", "Video lessons", "Hands-on practice", "Projects first", "Structured lessons"];
const budgetChoices = ["Prefer free resources", "Free only", "Some paid resources are okay", "Budget not a constraint"];
const categories = ["Learning", "Career", "Health & fitness", "Creative", "Personal growth", "Finance", "Other"];

function buildInitial(values: FirstGoalAnswers | null): GoalCreationValues {
  return {
    title: values?.title ?? "",
    description: values?.description ?? "",
    category: "Learning",
    skillLevel: values?.skillLevel || "Beginner",
    durationDays: Math.min(730, Math.max(1, Number(values?.durationDays) || 60)),
    startDate: localDay(),
    minutesPerDay: Math.min(1440, Math.max(5, Number(values?.minutesPerDay) || 60)),
    successCriteria: values?.successCriteria ?? "",
    constraints: values?.constraints ?? "",
    previousExperience: values?.previousExperience ?? "",
    learningStyle: values?.learningStyle || "Self-paced mixed learning",
    budgetPreference: values?.budgetPreference || "Prefer free resources",
  };
}

export default function GoalCreationPage({
  initialValues,
  onCancel,
  onSubmit,
  busy,
  error,
}: {
  initialValues: FirstGoalAnswers | null;
  onCancel: () => void;
  onSubmit: (values: GoalCreationValues) => void;
  busy: boolean;
  error: string;
}) {
  const [values, setValues] = useState<GoalCreationValues>(() => buildInitial(initialValues));
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState("");
  const today = localDay();
  const tomorrow = (() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return localDay(date);
  })();
  const stepTitles = ["Your outcome", "Starting point", "Timeline", "Preferences", "Review & build"];
  const progress = ((step + 1) / stepTitles.length) * 100;
  const set = <K extends keyof GoalCreationValues>(key: K, value: GoalCreationValues[K]) =>
    setValues(previous => ({ ...previous, [key]: value }));

  function validateStep(index: number) {
    const title = values.title.trim();
    if (index === 0) {
      if (title.length < 3) return "Add a goal title with at least 3 characters.";
      if (values.description.trim().length < 8) return "Describe the result you want in at least 8 characters.";
      return "";
    }
    if (index === 1) {
      if (!values.category.trim() || !values.skillLevel.trim()) return "Choose a category and your starting level.";
      return "";
    }
    if (index === 2) {
      if (!Number.isInteger(values.durationDays) || values.durationDays < 1 || values.durationDays > 730) return "Choose a goal length between 1 and 730 days.";
      if (!Number.isInteger(values.minutesPerDay) || values.minutesPerDay < 5 || values.minutesPerDay > 1440) return "Choose between 5 and 1,440 minutes per day.";
      if (values.startDate < today) return "Choose today or a future start date.";
      return "";
    }
    return "";
  }

  function advance() {
    const message = validateStep(step);
    if (message) {
      setStepError(message);
      return;
    }
    setStepError("");
    setStep(current => Math.min(stepTitles.length - 1, current + 1));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < stepTitles.length - 1) {
      advance();
      return;
    }
    const message = [0, 1, 2, 3].map(validateStep).find(Boolean) ?? "";
    if (message) {
      setStepError(message);
      const invalidStep = [0, 1, 2, 3].find(index => validateStep(index)) ?? 0;
      setStep(invalidStep);
      return;
    }
    setStepError("");
    onSubmit({ ...values, title: values.title.trim(), description: values.description.trim() });
  }

  function cancel() {
    if (window.confirm("Discard this goal draft? Your unsaved answers will be lost.")) onCancel();
  }

  return (
    <main className="page goal-create-page">
      <header className="goal-create-header">
        <a className="goal-create-brand" href="/" aria-label="AURA-X home"><span className="brand-mark">A✳</span><strong>AURA <b>X</b></strong></a>
        <span className="goal-create-header-label">Personal goal builder</span>
        <button className="btn btn-ghost goal-create-cancel" type="button" onClick={cancel} disabled={busy}>Cancel</button>
      </header>

      <section className="goal-create-card" aria-labelledby="goal-create-title">
        <div className="goal-create-topline">
          <span className="eyebrow">MAKE IT REALISTIC. MAKE IT YOURS.</span>
          <span className="goal-create-step-count">Step {step + 1} of {stepTitles.length}</span>
        </div>
        <div className="goal-create-progress" role="progressbar" aria-label="Goal setup progress" aria-valuemin={1} aria-valuemax={stepTitles.length} aria-valuenow={step + 1}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <p className="goal-create-step-name">{stepTitles[step]}</p>
        <h1 id="goal-create-title">{step === 0 ? "What do you want to achieve?" : step === 1 ? "Where are you starting from?" : step === 2 ? "Choose a timeline that fits real life." : step === 3 ? "Help Auri make the plan fit you." : "Review your goal before you build it."}</h1>
        <p className="goal-create-intro">Your answers stay here as you move between steps. Auri uses them to shape a practical, editable plan.</p>

        {error && <div className="aura-error goal-create-error" role="alert">{error}</div>}
        {stepError && <div className="aura-error goal-create-error" role="alert">{stepError}</div>}

        <form className="goal-create-form" onSubmit={submit}>
          {step === 0 && <div className="goal-create-step-body">
            <label className="field">Goal title
              <input value={values.title} onChange={event => set("title", event.target.value)} placeholder="e.g. Build a portfolio and apply for design roles" minLength={3} maxLength={160} autoFocus />
            </label>
            <label className="field goal-description-field">Describe the outcome you want
              <textarea value={values.description} onChange={event => set("description", event.target.value)} placeholder="What would you like to accomplish? Why does it matter? Add any details that will help Auri understand the goal." maxLength={5000} rows={8} />
              <span className="goal-create-help">Be specific if you can. You can refine this before building your roadmap.</span>
            </label>
          </div>}

          {step === 1 && <div className="goal-create-step-body goal-create-grid">
            <label className="field">Goal category
              <select value={values.category} onChange={event => set("category", event.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="field">Starting level
              <select value={values.skillLevel} onChange={event => set("skillLevel", event.target.value)}>{["Beginner", "Some experience", "Intermediate", "Advanced"].map(item => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="field goal-create-full">Previous experience or attempts
              <textarea value={values.previousExperience} onChange={event => set("previousExperience", event.target.value)} placeholder="What have you tried so far? It is fine to say ‘not yet’." maxLength={3000} rows={5} />
            </label>
          </div>}

          {step === 2 && <div className="goal-create-step-body">
            <fieldset className="goal-start-date-fieldset">
              <legend>When would you like to start?</legend>
              <div className="goal-date-quick-actions">
                <button type="button" className={values.startDate === today ? "goal-date-choice active" : "goal-date-choice"} onClick={() => set("startDate", today)}>Start today <small>{dateLabel(today)}</small></button>
                <button type="button" className={values.startDate === tomorrow ? "goal-date-choice active" : "goal-date-choice"} onClick={() => set("startDate", tomorrow)}>Start tomorrow <small>{dateLabel(tomorrow)}</small></button>
              </div>
              <label className="field">Or choose a date
                <input type="date" value={values.startDate} min={today} onChange={event => set("startDate", event.target.value)} />
              </label>
            </fieldset>
            <div className="goal-duration-block">
              <label className="field">How long do you want to work toward this goal?
                <input type="number" min={1} max={730} value={values.durationDays} onChange={event => set("durationDays", Number(event.target.value))} />
                <span className="goal-create-help">Choose a duration up to two years. Attendance will show every day in the goal.</span>
              </label>
              <div className="goal-duration-choices" aria-label="Common goal durations">
                {[10, 20, 30, 60, 100, 180, 365, 730].map(days => <button key={days} type="button" className={values.durationDays === days ? "goal-duration-choice active" : "goal-duration-choice"} onClick={() => set("durationDays", days)}>{days === 30 ? "1 month" : days === 180 ? "6 months" : days === 365 ? "1 year" : days === 730 ? "2 years" : `${days} days`}</button>)}
              </div>
            </div>
            <label className="field">Realistic time you can spend per day (minutes)
              <input type="number" min={5} max={1440} value={values.minutesPerDay} onChange={event => set("minutesPerDay", Number(event.target.value))} />
            </label>
          </div>}

          {step === 3 && <div className="goal-create-step-body goal-create-grid">
            <label className="field">How do you prefer to learn?
              <select value={values.learningStyle} onChange={event => set("learningStyle", event.target.value)}>{learningChoices.map(item => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="field">Resource budget
              <select value={values.budgetPreference} onChange={event => set("budgetPreference", event.target.value)}>{budgetChoices.map(item => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="field goal-create-full">What would show you are making meaningful progress?
              <textarea value={values.successCriteria} onChange={event => set("successCriteria", event.target.value)} placeholder="Optional: describe an observable result or milestone." maxLength={3000} rows={4} />
            </label>
            <label className="field goal-create-full">Constraints and preferences
              <textarea value={values.constraints} onChange={event => set("constraints", event.target.value)} placeholder="Schedule, prerequisites, access needs or anything else Auri should account for." maxLength={3000} rows={4} />
            </label>
          </div>}

          {step === 4 && <div className="goal-create-review">
            <div className="goal-review-item goal-review-wide"><span>Goal</span><strong>{values.title || "Untitled goal"}</strong><p>{values.description || "No description yet."}</p></div>
            <div className="goal-review-item"><span>Category & level</span><strong>{values.category} · {values.skillLevel}</strong></div>
            <div className="goal-review-item"><span>Start date & target</span><strong>{dateLabel(values.startDate)} — {dateLabel(addDateOnlyDays(values.startDate, values.durationDays - 1))}</strong></div>
            <div className="goal-review-item"><span>Duration & daily time</span><strong>{values.durationDays} days · {values.minutesPerDay} min/day</strong></div>
            <div className="goal-review-item"><span>Learning & budget</span><strong>{values.learningStyle} · {values.budgetPreference}</strong></div>
            <div className="goal-review-item"><span>Starting point</span><p>{values.previousExperience || "No previous experience added."}</p></div>
            <div className="goal-review-item"><span>Success criteria</span><p>{values.successCriteria || "Auri will propose measurable checkpoints for your review."}</p></div>
            <div className="goal-review-item goal-review-wide"><span>Constraints</span><p>{values.constraints || "None added."}</p></div>
            <p className="goal-create-help goal-review-wide">Your goal is saved only after you confirm below. The roadmap is generated from your answers; if generation fails, the saved draft stays available to retry.</p>
          </div>}

          <div className="goal-create-actions">
            {step > 0 ? <button type="button" className="btn btn-secondary" onClick={() => { setStepError(""); setStep(current => current - 1); }} disabled={busy}>← Back</button> : <button type="button" className="btn btn-secondary" onClick={cancel} disabled={busy}>Cancel</button>}
            {step < stepTitles.length - 1 ? <button type="submit" className="btn btn-primary" disabled={busy}>Continue <span>→</span></button> : <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving & planning…" : "Confirm & build my goal"}<span>↗</span></button>}
          </div>
        </form>
      </section>
      <footer className="goal-create-footer">AURA-X · Your plan is a guide, not a guarantee. You stay in control of changes.</footer>
    </main>
  );
}
