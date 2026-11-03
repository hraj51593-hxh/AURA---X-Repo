import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";
import { announceMascot } from "@/components/AuraMascot";
import FirstGoalIntake, { type FirstGoalAnswers } from "@/components/FirstGoalIntake";
import GoalCreationPage, { type GoalCreationValues } from "@/components/GoalCreationPage";
import { dateOnlyFromTimestamp, goalAttendanceDates } from "@shared/goal-dates";

type Outputs = inferRouterOutputs<AppRouter>;
type GoalRecord = Outputs["goals"]["list"][number];
type UserRecord = NonNullable<Outputs["auth"]["me"]>;
type Theme = "light" | "dark";
type AuthMode = "login" | "signup";
type WorkspaceTab =
  | "overview"
  | "roadmap"
  | "daily"
  | "resources"
  | "assessment"
  | "coach";

const fullDate = new Intl.DateTimeFormat("en", {
  weekday: "long",
  month: "short",
  day: "numeric",
});
const isToday = (date: Date | string | null) =>
  date ? new Date(date).toDateString() === new Date().toDateString() : false;
const initials = (name: string | null | undefined) =>
  (name || "A")
    .trim()
    .split(/\s+/)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const readableDate = (date: Date | string | null) =>
  date
    ? new Date(date).toLocaleDateString("en", {
        month: "short",
        day: "numeric",
      })
    : "No date";
const localDay = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const progressOf = (goal: GoalRecord) =>
  goal.tasks.length
    ? Math.round(
        (goal.tasks.filter(task => task.progress?.status === "completed")
          .length /
          goal.tasks.length) *
          100
      )
    : 0;
const queryError = (error: unknown) =>
  error instanceof Error
    ? error.message.replace(/^\[.*?\]\s*/, "")
    : "Something went wrong. Please try again.";

type ResourceFilter = "all" | "video" | "course" | "book" | "article" | "paper" | "dataset" | "project" | "practice" | "tutorial";
function resourceCategory(resource: { type: string; url: string | null }): Exclude<ResourceFilter, "all"> {
  const url = resource.url?.toLowerCase() ?? "";
  if (resource.type === "book" || url.includes("openlibrary.org/works/")) return "book";
  if (resource.type === "course" || url.includes("youtube.com/playlist")) return "course";
  if (resource.type === "dataset") return "dataset";
  if (resource.type === "paper" || url.includes("doi.org/")) return "paper";
  if (resource.type === "project") return "project";
  if (resource.type === "practice") return "practice";
  if (resource.type === "video" || url.includes("youtube.com/watch")) return "video";
  if (["tutorial", "documentation"].includes(resource.type)) return "tutorial";
  return "article";
}
function resourceProvider(url: string | null, description: string) {
  const address = url?.toLowerCase() ?? "";
  if (address.includes("openlibrary.org/")) return "Open Library";
  if (address.includes("doi.org/")) return "Crossref · DOI";
  if (address.includes("youtube.com/playlist")) return "YouTube playlist";
  if (address.includes("youtube.com/")) return "YouTube Search";
  if (address.includes("wikipedia.org/")) return "Wikipedia";
  const match = description.match(/(?:^|\s)Source:\s*([^·.]+)/i);
  if (match?.[1]) return match[1].trim();
  if (/brave search/i.test(description)) return "Brave Search";
  return "Saved resource";
}

function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand${small ? " brand-small" : ""}`}>
      <span className="brand-mark">
        A<span>✳</span>
      </span>
      <span>
        AURA <b>X</b>
      </span>
    </span>
  );
}

function MobilePrimaryNav({ page, onNavigate }: { page: string; onNavigate: (path: string) => void }) {
  const items = [
    { label: "Overview", icon: "▦", path: "/", active: page === "dashboard" },
    { label: "Goals", icon: "◎", path: "/goals", active: page === "goals" || page === "workspace" },
    { label: "Settings", icon: "⚙", path: "/settings", active: page === "settings" },
  ];
  return (
    <nav className="aura-mobile-nav" aria-label="Primary navigation">
      {items.map(item => (
        <button key={item.path} type="button" className={item.active ? "active" : ""} aria-current={item.active ? "page" : undefined} onClick={() => onNavigate(item.path)}>
          <span className="aura-mobile-nav-icon" aria-hidden="true">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function LoadingScreen() {
  return (
    <main className="page auth-page">
      <div className="aura-loading">
        <span className="brand-mark">✳</span>
        <p>Preparing your space…</p>
      </div>
    </main>
  );
}

export default function Home() {
  const [pathname, navigate] = useLocation();
  const [isGoalRoute, goalParams] = useRoute("/goals/:goalId");
  const [isGoalCreateRoute] = useRoute("/goals/new");
  const [theme, setTheme] = useState<Theme>("light");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("overview");
  const [firstGoalIntakeOpen, setFirstGoalIntakeOpen] = useState(false);
  const [goalIntakeAnswers, setGoalIntakeAnswers] = useState<FirstGoalAnswers | null>(null);
  const [notice, setNotice] = useState("");
  const [errorNotice, setErrorNotice] = useState("");
  const [resourceSearchNotice, setResourceSearchNotice] = useState("");
  const [resourceSearchQuery, setResourceSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [draftTitle, setDraftTitle] = useState("");
  const [profileName, setProfileName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number[]>>({});
  const [quizResult, setQuizResult] = useState<{
    scorePercent: number;
    feedback: string;
    note: string;
  } | null>(null);
  const [savingTask, setSavingTask] = useState<number | null>(null);
  const openCoachAfterGoalChange = useRef(false);
  const signupInterviewPending = useRef(false);
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery(undefined, { retry: 1 });
  const user = me.data as UserRecord | null | undefined;
  useEffect(() => {
    if (user !== undefined) window.dispatchEvent(new CustomEvent("aurax:auth-state", { detail: { authenticated: Boolean(user) } }));
  }, [user]);
  const goalsQuery = trpc.goals.list.useQuery(undefined, {
    enabled: !!user,
    retry: 1,
  });
  const analytics = trpc.analytics.useQuery(undefined, {
    enabled: !!user,
    retry: 1,
  });
  const goals = goalsQuery.data ?? [];
  const selectedId = isGoalRoute && !isGoalCreateRoute ? Number(goalParams?.goalId) : null;
  const selectedGoal = goals.find(goal => goal.id === selectedId) ?? null;
  const resourceStatus = trpc.learning.resources.status.useQuery(undefined, {
    enabled: !!user && !!selectedGoal && workspaceTab === "resources",
  });
  const assessmentsQuery = trpc.learning.assessments.list.useQuery(
    { goalId: selectedGoal?.id ?? 0 },
    { enabled: !!user && !!selectedGoal && workspaceTab === "assessment" }
  );
  const coachQuery = trpc.learning.coach.history.useQuery(
    { goalId: selectedGoal?.id ?? 0 },
    { enabled: !!user && !!selectedGoal && workspaceTab === "coach" }
  );
  const attendanceQuery = trpc.attendance.list.useQuery(
    { goalId: selectedGoal?.id ?? 0 },
    { enabled: !!user && !!selectedGoal && workspaceTab === "overview" }
  );
  const [toastTimer, setToastTimer] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const invalidateWorkspace = async () => {
    await Promise.all([
      utils.goals.list.invalidate(),
      utils.analytics.invalidate(),
    ]);
  };
  const flash = (message: string, isError = false) => {
    if (toastTimer) clearTimeout(toastTimer);
    announceMascot(isError ? "confused" : "celebrate");
    window.dispatchEvent(new CustomEvent("aurax:feedback", { detail: { message, isError } }));
    setNotice(isError ? "" : message);
    setErrorNotice(isError ? message : "");
    const timer = setTimeout(() => {
      setNotice("");
      setErrorNotice("");
    }, 4500);
    setToastTimer(timer);
  };

  const login = trpc.auth.login.useMutation();
  const register = trpc.auth.register.useMutation();
  const logout = trpc.auth.logout.useMutation();
  const createDraft = trpc.goals.createDraft.useMutation();
  const generate = trpc.goals.generate.useMutation();
  const setStatus = trpc.goals.setStatus.useMutation();
  const deleteGoal = trpc.goals.delete.useMutation();
  const updateProfile = trpc.auth.updateProfile.useMutation();
  const changePassword = trpc.auth.changePassword.useMutation();
  const deleteAccount = trpc.auth.deleteAccount.useMutation();
  const setTaskProgress = trpc.tasks.setProgress.useMutation();
  const attendanceMutation = trpc.attendance.record.useMutation();
  const clearAttendanceMutation = trpc.attendance.clear.useMutation();
  const markReviewed = trpc.resources.markReviewed.useMutation();
  const markBookmarked = trpc.resources.markBookmarked.useMutation();
  const searchResources = trpc.learning.resources.search.useMutation();
  const createAssessment = trpc.learning.assessments.generate.useMutation();
  const submitAssessment = trpc.learning.assessments.submit.useMutation();
  const sendCoach = trpc.learning.coach.send.useMutation();
  const createAdjustment = trpc.learning.adjustments.suggest.useMutation();
  const resolveAdjustment = trpc.learning.adjustments.resolve.useMutation();

  useEffect(() => {
    if (searchResources.isPending) announceMascot("searching");
    else if (
      createDraft.isPending || generate.isPending || createAssessment.isPending ||
      submitAssessment.isPending || sendCoach.isPending || createAdjustment.isPending ||
      resolveAdjustment.isPending
    ) announceMascot("thinking");
  }, [
    searchResources.isPending,
    createDraft.isPending,
    generate.isPending,
    createAssessment.isPending,
    submitAssessment.isPending,
    sendCoach.isPending,
    createAdjustment.isPending,
    resolveAdjustment.isPending,
  ]);

  useEffect(() => {
    const stored = localStorage.getItem("aura-theme");
    const nextTheme: Theme = stored === "dark" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    return () => {
      if (toastTimer) clearTimeout(toastTimer);
    };
  }, []);

  useEffect(() => {
    if (user) setProfileName(user.name || "");
  }, [user?.id, user?.name]);
  useEffect(() => {
    if (!user || !signupInterviewPending.current || !goalsQuery.isSuccess) return;
    signupInterviewPending.current = false;
    if (goals.length === 0) setFirstGoalIntakeOpen(true);
  }, [user?.id, goalsQuery.isSuccess, goals.length]);
  useEffect(() => {
    setWorkspaceTab(openCoachAfterGoalChange.current ? "coach" : "overview");
    openCoachAfterGoalChange.current = false;
    setResourceSearchNotice("");
    setResourceSearchQuery("");
    setQuizResult(null);
    setQuizAnswers({});
  }, [selectedId]);

  useEffect(() => {
    const section = pathname === "/settings" ? "settings" : pathname === "/goals" ? "goals" : workspaceTab;
    window.dispatchEvent(new CustomEvent("aurax:section", { detail: section }));
  }, [pathname, workspaceTab]);

  const page =
    isGoalCreateRoute
      ? "goal-create"
      : pathname === "/settings"
      ? "settings"
      : pathname === "/goals"
        ? "goals"
        : isGoalRoute
          ? "workspace"
          : "dashboard";
  const activeGoals = useMemo(
    () => goals.filter(goal => goal.status === "active"),
    [goals]
  );
  useEffect(() => {
    const openCoach = () => {
      if (!user) {
        setNotice("");
        setErrorNotice("Sign in or create an account to use the AI Coach.");
        announceMascot("confused");
        return;
      }
      const target = selectedGoal ?? activeGoals[0] ?? goals[0];
      if (!target) {
        setNotice("Auri will help you shape your first goal before anything is saved.");
        setErrorNotice("");
        setFirstGoalIntakeOpen(true);
        return;
      }
      if (selectedGoal?.id === target.id) {
        setWorkspaceTab("coach");
        return;
      }
      openCoachAfterGoalChange.current = true;
      navigate(`/goals/${target.id}`);
    };
    window.addEventListener("aurax:open-coach", openCoach);
    return () => window.removeEventListener("aurax:open-coach", openCoach);
  }, [user, selectedGoal, activeGoals, goals, navigate]);
  const avgProgress = goals.length
    ? Math.round(
        goals.reduce((sum, goal) => sum + progressOf(goal), 0) / goals.length
      )
    : 0;
  const todayFocus = goals
    .flatMap(goal => goal.tasks)
    .filter(
      task => isToday(task.dueAt) && task.progress?.status !== "completed"
    )
    .reduce((sum, task) => sum + task.estimatedMinutes, 0);
  const goalList = goals.filter(goal =>
    activeFilter === "all"
      ? goal.status !== "archived"
      : activeFilter === "active"
        ? goal.status === "active"
        : goal.status === "completed"
  );

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("aura-theme", next);
  };

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "");
    const password = String(data.get("password") || "");
    try {
      if (authMode === "login") await login.mutateAsync({ email, password });
      else
        await register.mutateAsync({
          name: String(data.get("name") || ""),
          email,
          password,
        });
      if (authMode === "signup") signupInterviewPending.current = true;
      await utils.auth.me.invalidate();
      flash(
        authMode === "login"
          ? "You're signed in."
          : "Your account is ready. Let's set your first goal."
      );
    } catch (error) {
      flash(queryError(error), true);
    }
  }

  async function handleLogout() {
    try {
      await logout.mutateAsync();
      await utils.auth.me.invalidate();
      await utils.goals.list.reset();
      navigate("/");
      flash("You have signed out.");
    } catch (error) {
      flash(queryError(error), true);
    }
  }

  async function handleCreateGoal(formValues: GoalCreationValues) {
    const description = formValues.description.trim();
    const previousExperience = formValues.previousExperience.trim();
    const experienceNote = previousExperience
      ? `\n\nPrevious experience: ${previousExperience}`
      : "";
    const values = {
      title: formValues.title.trim(),
      description: experienceNote
        ? `${description.slice(0, Math.max(0, 5000 - experienceNote.length))}${experienceNote}`
        : description,
      category: formValues.category,
      skillLevel: formValues.skillLevel,
      durationDays: formValues.durationDays,
      startDate: formValues.startDate,
      minutesPerDay: formValues.minutesPerDay,
      successCriteria: formValues.successCriteria.trim() || null,
      constraints: formValues.constraints.trim() || null,
      learningStyle: formValues.learningStyle,
      budgetPreference: formValues.budgetPreference,
    };
    try {
      const draft = await createDraft.mutateAsync(values);
      setGoalIntakeAnswers(null);
      setDraftTitle(values.title);
      navigate(`/goals/${draft.id}`);
      await invalidateWorkspace();
      try {
        await generate.mutateAsync({ goalId: draft.id });
        setDraftTitle("");
        await invalidateWorkspace();
        flash("Your roadmap is ready and saved.");
      } catch (error) {
        setDraftTitle(values.title);
        flash(
          "Your goal draft is saved. Roadmap generation failed; retry when the AI service is available.",
          true
        );
      }
    } catch (error) {
      flash(queryError(error), true);
    }
  }

  async function retryRoadmap(goalId: number) {
    setDraftTitle("Generating your roadmap…");
    try {
      await generate.mutateAsync({ goalId });
      await invalidateWorkspace();
      setDraftTitle("");
      flash("Your roadmap is ready and saved.");
    } catch (error) {
      setDraftTitle("");
      flash(queryError(error), true);
    }
  }

  async function setTaskDone(
    goal: GoalRecord,
    task: GoalRecord["tasks"][number],
    completed: boolean
  ) {
    setSavingTask(task.id);
    try {
      await setTaskProgress.mutateAsync({
        taskId: task.id,
        completed,
        notes: task.progress?.notes || undefined,
        evidence: task.progress?.evidence || undefined,
        actualMinutes: task.progress?.actualMinutes ?? undefined,
      });
      await invalidateWorkspace();
      if (completed) announceMascot("celebrate");
    } catch (error) {
      flash(queryError(error), true);
    } finally {
      setSavingTask(null);
    }
  }

  async function setTaskState(
    task: GoalRecord["tasks"][number],
    status: "todo" | "missed"
  ) {
    setSavingTask(task.id);
    try {
      await setTaskProgress.mutateAsync({
        taskId: task.id,
        status,
        notes: task.progress?.notes || undefined,
        evidence: task.progress?.evidence || undefined,
        actualMinutes: task.progress?.actualMinutes ?? undefined,
      });
      await invalidateWorkspace();
    } catch (error) {
      flash(queryError(error), true);
    } finally {
      setSavingTask(null);
    }
  }

  async function saveTaskReflection(
    task: GoalRecord["tasks"][number],
    reflection: { notes: string; evidence: string; actualMinutes?: number }
  ) {
    setSavingTask(task.id);
    try {
      await setTaskProgress.mutateAsync({
        taskId: task.id,
        status: task.progress?.status ?? "todo",
        notes: reflection.notes,
        evidence: reflection.evidence,
        actualMinutes: reflection.actualMinutes,
      });
      await invalidateWorkspace();
      flash("Task reflection saved.");
    } catch (error) {
      flash(queryError(error), true);
    } finally {
      setSavingTask(null);
    }
  }

  async function recordAttendance(day: string, status: "showed_up" | "missed") {
    if (!selectedGoal) return;
    try {
      await attendanceMutation.mutateAsync({
        goalId: selectedGoal.id,
        day,
        status,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      await utils.attendance.list.invalidate({
        goalId: selectedGoal.id,
      });
      flash(
        status === "showed_up"
          ? "Attendance marked as attended."
          : "Attendance marked as missed. You can restart with the next step."
      );
    } catch (error) {
      flash(queryError(error), true);
    }
  }

  async function clearAttendance(day: string) {
    if (!selectedGoal) return;
    try {
      await clearAttendanceMutation.mutateAsync({
        goalId: selectedGoal.id,
        day,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      await utils.attendance.list.invalidate({ goalId: selectedGoal.id });
      flash("Attendance mark cleared. This day is now unrecorded.");
    } catch (error) {
      flash(queryError(error), true);
    }
  }

  async function toggleResource(resourceId: number, reviewed: boolean) {
    try {
      await markReviewed.mutateAsync({ resourceId, reviewed });
      await invalidateWorkspace();
    } catch (error) {
      flash(queryError(error), true);
    }
  }

  async function toggleResourceBookmark(resourceId: number, bookmarked: boolean) {
    try {
      await markBookmarked.mutateAsync({ resourceId, bookmarked });
      await invalidateWorkspace();
      flash(bookmarked ? "Resource bookmarked." : "Bookmark removed.");
    } catch (error) {
      flash(queryError(error), true);
    }
  }

  async function searchGoalResources() {
    if (!selectedGoal) return;
    searchResources.reset();
    setResourceSearchNotice("Searching live providers for resources matched to this goal…");
    try {
      const result = await searchResources.mutateAsync({ goalId: selectedGoal.id, query: resourceSearchQuery.trim() || undefined });
      await invalidateWorkspace();
      const summary = result.saved
        ? `${result.saved} new resources saved from ${result.provider}.`
        : result.found
          ? `Found ${result.found} matching resources; they were already saved.`
          : `No matching resources were returned by ${result.provider}.`;
      const partialNote = result.partial
        ? ` Unavailable this time: ${result.unavailableProviders.join(", ")}.`
        : "";
      setResourceSearchNotice(`${summary}${partialNote}`);
      flash(result.saved ? `${result.saved} new resources saved.` : "Search finished; no new resources were added.");
    } catch (error) {
      setResourceSearchNotice("");
      flash(queryError(error), true);
    }
  }

  async function runAssessment() {
    if (!selectedGoal) return;
    setQuizResult(null);
    try {
      await createAssessment.mutateAsync({ goalId: selectedGoal.id });
      await utils.learning.assessments.list.invalidate({
        goalId: selectedGoal.id,
      });
      flash("A learning check has been created for this goal.");
    } catch (error) {
      flash(queryError(error), true);
    }
  }

  async function submitQuiz(
    event: React.FormEvent<HTMLFormElement>,
    assessmentId: number,
    questionCount: number
  ) {
    event.preventDefault();
    const answers = quizAnswers[assessmentId] || [];
    if (
      answers.length !== questionCount ||
      answers.some(answer => answer < 0 || answer > 3)
    ) {
      flash("Answer every question before submitting.", true);
      return;
    }
    try {
      const result = await submitAssessment.mutateAsync({
        assessmentId,
        answers,
      });
      setQuizResult({
        scorePercent: result.scorePercent,
        feedback: result.feedback,
        note: result.note,
      });
      await Promise.all([
        utils.learning.assessments.list.invalidate({
          goalId: selectedGoal!.id,
        }),
        invalidateWorkspace(),
      ]);
      announceMascot("happy");
    } catch (error) {
      flash(queryError(error), true);
    }
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGoal || !chatInput.trim()) return;
    const message = chatInput.trim();
    setChatInput("");
    try {
      await sendCoach.mutateAsync({ goalId: selectedGoal.id, message });
      await utils.learning.coach.history.invalidate({
        goalId: selectedGoal.id,
      });
      announceMascot("happy");
    } catch (error) {
      setChatInput(message);
      flash(queryError(error), true);
      await utils.learning.coach.history.invalidate({
        goalId: selectedGoal.id,
      });
    }
  }

  async function suggestAdjustment() {
    if (!selectedGoal) return;
    try {
      await createAdjustment.mutateAsync({ goalId: selectedGoal.id });
      await invalidateWorkspace();
      flash("An evidence-based suggestion is ready for your review.");
    } catch (error) {
      flash(queryError(error), true);
    }
  }

  async function decideAdjustment(
    adjustmentId: number,
    decision: "accept" | "dismiss"
  ) {
    try {
      await resolveAdjustment.mutateAsync({ adjustmentId, decision });
      await invalidateWorkspace();
      flash(
        decision === "accept"
          ? "Your accepted schedule update has been applied."
          : "Suggestion dismissed."
      );
    } catch (error) {
      flash(queryError(error), true);
    }
  }

  if (me.isLoading) return <LoadingScreen />;
  if (me.isError && !user)
    return (
      <main className="page auth-page">
        <div className="aura-empty">
          <h3>We couldn't connect to AURA-X</h3>
          <p>Check your connection and retry the sign-in check.</p>
          <button
            className="btn btn-secondary"
            onClick={() => void me.refetch()}
          >
            Retry
          </button>
        </div>
      </main>
    );
  if (!user)
    return (
      <AuthScreen
        mode={authMode}
        setMode={setAuthMode}
        onSubmit={handleAuth}
        busy={login.isPending || register.isPending}
        error={errorNotice}
        theme={theme}
        toggleTheme={toggleTheme}
        onForgot={() =>
          flash(
            "Password reset email delivery is not configured yet. Contact the project owner for account help.",
            true
          )
        }
      />
    );
  if (goalsQuery.isError)
    return (
      <main className="page app-page">
        <div className="aura-empty">
          <h3>We couldn't load your goals</h3>
          <p>{queryError(goalsQuery.error)}</p>
          <button
            className="btn btn-secondary"
            onClick={() => void goalsQuery.refetch()}
          >
            Retry
          </button>
          <button className="btn btn-ghost" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </main>
    );

  if (page === "goal-create")
    return (
      <GoalCreationPage
        initialValues={goalIntakeAnswers}
        onCancel={() => { setGoalIntakeAnswers(null); navigate(goals.length ? "/goals" : "/"); }}
        onSubmit={handleCreateGoal}
        busy={createDraft.isPending || generate.isPending}
        error={createDraft.error ? queryError(createDraft.error) : ""}
      />
    );

  return (
    <>
      {errorNotice && (
        <div className="toast show aura-toast-error" role="alert">
          {errorNotice}
        </div>
      )}
      {notice && (
        <div className="toast show" role="status">
          {notice}
        </div>
      )}
      {firstGoalIntakeOpen && (
        <FirstGoalIntake
          onClose={() => setFirstGoalIntakeOpen(false)}
          onComplete={answers => {
            setGoalIntakeAnswers(answers);
            setFirstGoalIntakeOpen(false);
            navigate("/goals/new");
          }}
        />
      )}
      {page === "settings" ? (
        <SettingsScreen
          user={user}
          profileName={profileName}
          setProfileName={setProfileName}
          currentPassword={currentPassword}
          setCurrentPassword={setCurrentPassword}
          newPassword={newPassword}
          setNewPassword={setNewPassword}
          onProfile={async event => {
            event.preventDefault();
            try {
              await updateProfile.mutateAsync({ name: profileName });
              await utils.auth.me.invalidate();
              flash("Profile saved.");
            } catch (error) {
              flash(queryError(error), true);
            }
          }}
          onPassword={async event => {
            event.preventDefault();
            try {
              await changePassword.mutateAsync({
                currentPassword,
                newPassword,
              });
              setCurrentPassword("");
              setNewPassword("");
              flash("Password updated.");
            } catch (error) {
              flash(queryError(error), true);
            }
          }}
          onDeleteAccount={async () => {
            if (
              !window.confirm(
                "Permanently delete your AURA-X account and all associated goals, roadmaps, tasks, resources and assessments? This cannot be undone."
              )
            )
              return;
            try {
              await deleteAccount.mutateAsync({ confirmed: true });
              await utils.auth.me.invalidate();
              navigate("/");
            } catch (error) {
              flash(queryError(error), true);
            }
          }}
          onBack={() => navigate("/")}
          busy={
            updateProfile.isPending ||
            changePassword.isPending ||
            deleteAccount.isPending
          }
        />
      ) : page === "workspace" && selectedGoal ? (
        <WorkspaceScreen
          goal={selectedGoal}
          tab={workspaceTab}
          setTab={setWorkspaceTab}
          user={user}
          theme={theme}
          toggleTheme={toggleTheme}
          onBack={() => navigate("/")}
          onLogout={handleLogout}
          onTaskDone={setTaskDone}
          onTaskState={setTaskState}
          onSaveTaskReflection={saveTaskReflection}
          savingTask={savingTask}
          attendance={attendanceQuery.data ?? []}
          attendanceBusy={attendanceMutation.isPending || clearAttendanceMutation.isPending}
          onAttendance={recordAttendance}
          onClearAttendance={clearAttendance}
          onRetryRoadmap={() => retryRoadmap(selectedGoal.id)}
          draftTitle={draftTitle}
          busy={generate.isPending}
          assessments={assessmentsQuery.data ?? []}
          assessmentsLoading={assessmentsQuery.isLoading}
          onGenerateAssessment={runAssessment}
          assessmentBusy={createAssessment.isPending}
          quizAnswers={quizAnswers}
          setQuizAnswers={setQuizAnswers}
          quizResult={quizResult}
          onSubmitQuiz={submitQuiz}
          assessmentSubmitting={submitAssessment.isPending}
          onResourceReviewed={toggleResource}
          onResourceBookmarked={toggleResourceBookmark}
          resourceSearchQuery={resourceSearchQuery}
          setResourceSearchQuery={setResourceSearchQuery}
          resourceSearchAvailable={resourceStatus.data?.available ?? true}
          resourceSearchProvider={resourceStatus.data?.provider ?? "Checking"}
          resourceStatusLoading={resourceStatus.isLoading}
          resourceStatusError={resourceStatus.isError ? queryError(resourceStatus.error) : ""}
          onRetryResourceStatus={() => void resourceStatus.refetch()}
          resourceSearchBusy={searchResources.isPending}
          resourceSearchNotice={resourceSearchNotice}
          resourceSearchError={searchResources.isError ? queryError(searchResources.error) : ""}
          onSearchResources={searchGoalResources}
          onSendMessage={sendMessage}
          chatInput={chatInput}
          setChatInput={setChatInput}
          chatMessages={coachQuery.data ?? []}
          chatLoading={coachQuery.isLoading}
          coachBusy={sendCoach.isPending}
          onSuggestAdjustment={suggestAdjustment}
          adjustmentBusy={createAdjustment.isPending}
          onResolveAdjustment={decideAdjustment}
          adjustmentBusyId={
            resolveAdjustment.isPending
              ? (resolveAdjustment.variables?.adjustmentId ?? null)
              : null
          }
          onStatus={async status => {
            try {
              await setStatus.mutateAsync({ goalId: selectedGoal.id, status });
              await invalidateWorkspace();
              flash(`Goal ${status}.`);
            } catch (error) {
              flash(queryError(error), true);
            }
          }}
          onDelete={async () => {
            if (
              !window.confirm(
                `Delete “${selectedGoal.title}” and all of its saved roadmap, task, resource and assessment data?`
              )
            )
              return;
            try {
              await deleteGoal.mutateAsync({
                goalId: selectedGoal.id,
                confirmed: true,
              });
              await invalidateWorkspace();
              navigate("/");
              flash("Goal deleted.");
            } catch (error) {
              flash(queryError(error), true);
            }
          }}
        />
      ) : (
        <DashboardScreen
          user={user}
          goals={goals}
          page={page as "dashboard" | "goals"}
          theme={theme}
          toggleTheme={toggleTheme}
          onLogout={handleLogout}
          analytics={analytics.data}
          analyticsLoading={analytics.isLoading}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          goalList={goalList}
          onNavigate={navigate}
          onNewGoal={() => {
            setFirstGoalIntakeOpen(false);
            setGoalIntakeAnswers(null);
            navigate("/goals/new");
          }}
        />
      )}
      <MobilePrimaryNav page={page} onNavigate={navigate} />
    </>
  );
}

function AuthScreen({
  mode,
  setMode,
  onSubmit,
  busy,
  error,
  theme,
  toggleTheme,
  onForgot,
}: {
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error: string;
  theme: Theme;
  toggleTheme: () => void;
  onForgot: () => void;
}) {
  return (
    <main className="page auth-page">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <nav className="topbar auth-nav">
        <a href="/" className="brand" aria-label="AURA X">
          <Brand />
        </a>
        <div className="nav-note">
          <span className="live-dot" /> Your ambition, with a system.
        </div>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </nav>
      <section className="auth-layout">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-line" /> THE PERSONAL GOAL OS
          </div>
          <h1>
            Big goals.
            <br />
            <span className="serif">Clear direction.</span>
            <br />
            Real progress.
          </h1>
          <p className="hero-sub">
            Turn the thing you keep thinking about into the thing you actually
            do. AURA X builds your plan, keeps you accountable, and helps you
            see your progress.
          </p>
          <div className="hero-proof">
            <span className="avatar-stack">
              <span>A</span>
              <span>U</span>
              <span>R</span>
              <span>✳</span>
            </span>
            <div>
              <strong>One step at a time.</strong>
              <small>Plan · Practice · Prove</small>
            </div>
          </div>
          <div className="orbit-wrap" aria-hidden="true">
            <div className="orbit orbit-a" />
            <div className="orbit orbit-b" />
            <div className="orbit orbit-c" />
            <div className="orbit-core">✳</div>
            <div className="orbit-node node-a">PLAN</div>
            <div className="orbit-node node-b">DO</div>
            <div className="orbit-node node-c">GROW</div>
          </div>
        </div>
        <div className="auth-card glass">
          <div className="auth-card-head">
            <div className="mini-mark">✳</div>
            <div>
              <p className="kicker">YOUR PERSONAL GOAL OS</p>
              <h2>
                {mode === "login" ? "Make it happen." : "Start with one goal."}
              </h2>
            </div>
          </div>
          <p className="muted">
            {mode === "login"
              ? "Sign in to pick up where your future left off."
              : "Create a private account to save your plans and progress."}
          </p>
          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => setMode("login")}
            >
              Log in
            </button>
            <button
              className={`auth-tab ${mode === "signup" ? "active" : ""}`}
              onClick={() => setMode("signup")}
            >
              Create account
            </button>
          </div>
          {error && (
            <div className="aura-error" role="alert">
              {error}
            </div>
          )}
          <form className="stack-form" onSubmit={onSubmit}>
            {mode === "signup" && (
              <label className="field">
                Your name
                <input
                  name="name"
                  type="text"
                  placeholder="e.g. Alex Morgan"
                  autoComplete="name"
                  minLength={2}
                  maxLength={120}
                  required
                />
              </label>
            )}
            <label className="field">
              Email address
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                maxLength={320}
                required
              />
            </label>
            <label className="field">
              Password
              {mode === "signup" && (
                <span className="field-side">At least 10 characters</span>
              )}
              <input
                name="password"
                type="password"
                placeholder="Enter your password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={mode === "signup" ? 10 : 1}
                maxLength={128}
                required
              />
            </label>
            {mode === "login" && (
              <div className="form-row">
                <span>Private by design</span>
                <button
                  type="button"
                  className="aura-text-button"
                  onClick={onForgot}
                >
                  Forgot password?
                </button>
              </div>
            )}
            <button
              className="btn btn-primary btn-wide"
              type="submit"
              disabled={busy}
            >
              <span>
                {busy
                  ? "Please wait…"
                  : mode === "login"
                    ? "Enter your space"
                    : "Create my account"}
              </span>
              <span>↗</span>
            </button>
          </form>
          <p className="fine-print">
            By continuing, you agree to use your goals as a promise to yourself.
            Passwords are stored as salted hashes.
          </p>
        </div>
      </section>
      <footer className="auth-footer">
        <span>© 2026 AURA X</span>
        <span>Designed for progress, not perfection.</span>
        <span>Plan · Practice · Prove</span>
      </footer>
    </main>
  );
}

function DashboardScreen({
  user,
  goals,
  page,
  theme,
  toggleTheme,
  onLogout,
  analytics,
  analyticsLoading,
  activeFilter,
  setActiveFilter,
  goalList,
  onNavigate,
  onNewGoal,
}: {
  user: UserRecord;
  goals: GoalRecord[];
  page: "dashboard" | "goals";
  theme: Theme;
  toggleTheme: () => void;
  onLogout: () => void;
  analytics: Outputs["analytics"] | undefined;
  analyticsLoading: boolean;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  goalList: GoalRecord[];
  onNavigate: (path: string) => void;
  onNewGoal: () => void;
}) {
  const firstName = (user.name || "there").trim().split(/\s+/)[0];
  const active = goals.filter(goal => goal.status === "active");
  const allTasks = goals.flatMap(goal => goal.tasks);
  const pendingToday = allTasks.filter(
    task => isToday(task.dueAt) && task.progress?.status !== "completed"
  );
  const todayFocus = pendingToday.reduce(
    (sum, task) => sum + task.estimatedMinutes,
    0
  );
  const progress = analytics?.weeklyProgress ?? [];
  const maxBar = Math.max(1, ...progress.map(day => day.completed));
  return (
    <main className="page app-page">
      <aside className="sidebar">
        <a
          className="sidebar-brand"
          href="/"
          onClick={event => {
            event.preventDefault();
            onNavigate("/");
          }}
        >
          <Brand />
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <button
          className={`side-link ${page === "dashboard" ? "active" : ""}`}
          onClick={() => onNavigate("/")}
        >
          <span>▦</span> Overview
        </button>
        <button
          className={`side-link ${page === "goals" ? "active" : ""}`}
          onClick={() => onNavigate("/goals")}
        >
          <span>◎</span> My goals{" "}
          <span className="side-count">{goals.length}</span>
        </button>
        <button className="side-link" onClick={onNewGoal}>
          <span>＋</span> Create a goal
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-star">✳</span>
            <p>
              Small actions,
              <br />
              <b>unreasonable results.</b>
            </p>
            <div className="tip-line">
              <span style={{ width: `${analytics?.progressPercent ?? 0}%` }} />
            </div>
          </div>
          <button className="side-link" onClick={() => onNavigate("/settings")}>
            <span>⚙</span> Preferences
          </button>
          <button
            className="profile-mini"
            onClick={() => onNavigate("/settings")}
          >
            <span className="profile-avatar">{initials(user.name)}</span>
            <span className="profile-meta">
              <b>{user.name}</b>
              <small>{user.email}</small>
            </span>
            <span className="more">···</span>
          </button>
        </div>
      </aside>
      <section className="app-main">
        <header className="app-topbar">
          <div className="mobile-brand">
            <a
              href="/"
              onClick={event => {
                event.preventDefault();
                onNavigate("/");
              }}
            >
              <Brand />
            </a>
          </div>
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="crumb-slash">/</span>
            <b>{page === "goals" ? "My goals" : "Overview"}</b>
          </div>
          <div className="top-actions">
            <span className="date-label">
              {fullDate.format(new Date()).toUpperCase()}
            </span>
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={onLogout}
            >
              ↗
            </button>
          </div>
        </header>
        {page === "dashboard" ? (
          <div className="dashboard-content">
            <div className="welcome-row">
              <div>
                <p className="eyebrow">YOUR SPACE TO BECOME</p>
                <h1>
                  Good to see you, {firstName}
                  <span className="wave">✳</span>
                </h1>
                <p className="muted">
                  You don't need to have it all figured out. Just take the next
                  step.
                </p>
              </div>
              <button className="btn btn-primary" onClick={onNewGoal}>
                ＋ Build a new goal
              </button>
            </div>
            <div className="stats-grid">
              <article className="stat-card">
                <div className="stat-top">
                  <span>Active goals</span>
                  <span className="stat-icon lavender">◎</span>
                </div>
                <div className="stat-value">
                  {analyticsLoading
                    ? "—"
                    : String(analytics?.activeGoals ?? active.length).padStart(
                        2,
                        "0"
                      )}
                </div>
                <div className="stat-foot">
                  <span className="tiny-dot purple" /> In progress right now
                </div>
              </article>
              <article className="stat-card">
                <div className="stat-top">
                  <span>Average progress</span>
                  <span className="stat-icon peach">↗</span>
                </div>
                <div className="stat-value">
                  <span>
                    {goals.length
                      ? Math.round(
                          goals.reduce(
                            (sum, goal) => sum + progressOf(goal),
                            0
                          ) / goals.length
                        )
                      : 0}
                  </span>
                  <small>%</small>
                </div>
                <div className="stat-foot">Calculated from saved tasks</div>
              </article>
              <article className="stat-card">
                <div className="stat-top">
                  <span>Tasks completed</span>
                  <span className="stat-icon mint">✳</span>
                </div>
                <div className="stat-value">
                  {analytics?.completedTasks ?? 0}
                  <small> / {analytics?.totalTasks ?? 0}</small>
                </div>
                <div className="stat-foot">Self-reported task progress</div>
              </article>
              <article className="stat-card highlight-stat">
                <div className="stat-top">
                  <span>Today's focus</span>
                  <span className="stat-icon cream">◷</span>
                </div>
                <div className="stat-value">
                  {Math.round(
                    pendingToday.reduce(
                      (sum, task) => sum + task.estimatedMinutes,
                      0
                    )
                  )}
                  <small> min</small>
                </div>
                <div className="stat-foot">
                  {todayFocus
                    ? `${pendingToday.length} saved task${pendingToday.length === 1 ? "" : "s"} scheduled today`
                    : "No tasks due today"}
                </div>
              </article>
            </div>
            <div className="section-heading">
              <div>
                <p className="eyebrow">THE WORK IN PROGRESS</p>
                <h2>
                  Your goals{" "}
                  <span className="heading-count">{active.length}</span>
                </h2>
              </div>
              <button
                className="text-button"
                onClick={() => onNavigate("/goals")}
              >
                View all goals <span>↗</span>
              </button>
            </div>
            {active.length ? (
              <div className="aura-goal-grid">
                {active.slice(0, 4).map(goal => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    onOpen={() => onNavigate(`/goals/${goal.id}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="aura-empty">
                <h3>Start with one clear outcome</h3>
                <p>
                  Your goals and progress will appear here once you create your
                  first goal.
                </p>
                <button className="btn btn-primary" onClick={onNewGoal}>
                  ＋ Build a new goal
                </button>
              </div>
            )}
            <div className="lower-grid">
              <article className="panel activity-panel">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">SHOW UP DAILY</p>
                    <h3>Upcoming focus</h3>
                  </div>
                  <span className="date-pill">SAVED TASKS</span>
                </div>
                <div className="today-activity">
                  {analytics?.upcomingTasks.length ? (
                    analytics.upcomingTasks.slice(0, 4).map(task => (
                      <div className="activity-row" key={task.id}>
                        <span className="activity-check">◷</span>
                        <span className="activity-row-info">
                          <b>{task.title}</b>
                          <small>
                            {readableDate(task.dueAt)} · {task.estimatedMinutes}{" "}
                            min
                          </small>
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="aura-muted">
                      No upcoming tasks yet. Generate a roadmap to get a next
                      step.
                    </p>
                  )}
                </div>
                <button
                  className="btn btn-secondary btn-wide"
                  onClick={() =>
                    active[0] && onNavigate(`/goals/${active[0].id}`)
                  }
                >
                  Open goal workspace <span>→</span>
                </button>
              </article>
              <article className="panel">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">LAST SEVEN DAYS</p>
                    <h3>Weekly progress</h3>
                  </div>
                  <span className="date-pill">SAVED ACTIVITY</span>
                </div>
                <div className="aura-week-bars">
                  {progress.map(day => (
                    <div
                      className="aura-week-bar"
                      key={day.date}
                      title={`${day.completed} completed tasks`}
                    >
                      <i
                        style={{
                          height: `${Math.max(5, (day.completed / maxBar) * 76)}px`,
                        }}
                      />
                      <span>
                        {new Date(`${day.date}T12:00:00`).toLocaleDateString(
                          "en",
                          { weekday: "short" }
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="aura-muted">
                  Each bar counts tasks recorded as complete on that date.
                </p>
              </article>
            </div>
            <div className="lower-grid">
              <article className="panel">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">RECENT ACTIVITY</p>
                    <h3>What moved</h3>
                  </div>
                </div>
                {analytics?.recentActivity.length ? (
                  analytics.recentActivity.slice(0, 5).map(item => (
                    <div className="activity-row" key={item.id}>
                      <span className="tiny-dot purple" />
                      <span className="activity-row-info">
                        <b>{item.summary}</b>
                        <small>{readableDate(item.createdAt)}</small>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="aura-muted">
                    Your saved activity will show here.
                  </p>
                )}
              </article>
              <article className="panel coach-panel">
                <div className="coach-orb">✳</div>
                <p className="eyebrow">YOUR AI GOAL PARTNER</p>
                <h3>
                  Clarity beats
                  <br />
                  <span>motivation.</span>
                </h3>
                <p className="muted">
                  Open a goal to ask the coach about your next move. It will use
                  your saved goal activity.
                </p>
                <button
                  className="btn btn-dark"
                  onClick={() =>
                    active[0] && onNavigate(`/goals/${active[0].id}`)
                  }
                >
                  Go to your coach <span>↗</span>
                </button>
              </article>
            </div>
            <footer className="app-footer">
              <span>© AURA X · PERSONAL GOAL OS</span>
              <span>
                Built around your next step <b>✳</b>
              </span>
            </footer>
          </div>
        ) : (
          <div className="dashboard-content">
            <div className="welcome-row">
              <div>
                <p className="eyebrow">YOUR AMBITION, ORGANIZED</p>
                <h1>All your goals.</h1>
                <p className="muted">
                  Progress isn't a straight line. Keep showing up.
                </p>
              </div>
              <button className="btn btn-primary" onClick={onNewGoal}>
                ＋ Create a goal
              </button>
            </div>
            <div className="filter-row">
              <div className="filter-tabs">
                {[
                  ["all", "All goals"],
                  ["active", "In progress"],
                  ["completed", "Completed"],
                ].map(([filter, label]) => (
                  <button
                    key={filter}
                    className={`filter-tab ${activeFilter === filter ? "active" : ""}`}
                    onClick={() => setActiveFilter(filter)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="muted small">
                {goalList.length} saved goal{goalList.length === 1 ? "" : "s"}
              </span>
            </div>
            {goalList.length ? (
              <div className="aura-goal-grid">
                {goalList.map(goal => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    onOpen={() => onNavigate(`/goals/${goal.id}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="aura-empty">
                <h3>No goals in this view</h3>
                <p>
                  Create a goal and AURA-X will help make the next step
                  concrete.
                </p>
                <button className="btn btn-primary" onClick={onNewGoal}>
                  Create a goal
                </button>
              </div>
            )}
            <footer className="app-footer">
              <span>© AURA X · PERSONAL GOAL OS</span>
              <span>
                Built around your next step <b>✳</b>
              </span>
            </footer>
          </div>
        )}
      </section>
    </main>
  );
}

function GoalCard({ goal, onOpen }: { goal: GoalRecord; onOpen: () => void }) {
  const progress = progressOf(goal);
  const done = goal.tasks.filter(
    task => task.progress?.status === "completed"
  ).length;
  const color = goal.category.toLowerCase().includes("health")
    ? "mint-icon"
    : goal.category.toLowerCase().includes("career")
      ? "peach-icon"
      : "purple-icon";
  return (
    <article
      className="goal-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Open ${goal.title}`}
    >
      <div className="goal-card-top">
        <span className={`goal-icon ${color}`}>✳</span>
        <div>
          <h3 className="goal-card-title">{goal.title}</h3>
          <span className="goal-subtitle">
            {goal.category} · {goal.skillLevel}
          </span>
        </div>
        <span
          className={`aura-chip ${goal.status === "draft" ? "aura-status-draft" : ""}`}
        >
          {goal.status}
        </span>
      </div>
      <p className="goal-card-description">{goal.description}</p>
      <div className="goal-card-meta">
        <span>Saved task progress</span>
        <b>
          {done}/{goal.tasks.length} tasks · {progress}%
        </b>
      </div>
      <div className="progress-line">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="goal-card-bottom">
        <span>
          {goal.tasks.length
            ? `${goal.durationDays} days · ${goal.minutesPerDay} min/day`
            : "Roadmap not yet generated"}
        </span>
        <span className="open-arrow">↗</span>
      </div>
    </article>
  );
}

function WorkspaceScreen(props: {
  goal: GoalRecord;
  tab: WorkspaceTab;
  setTab: (tab: WorkspaceTab) => void;
  user: UserRecord;
  theme: Theme;
  toggleTheme: () => void;
  onBack: () => void;
  onLogout: () => void;
  onTaskDone: (
    goal: GoalRecord,
    task: GoalRecord["tasks"][number],
    completed: boolean
  ) => void;
  onTaskState: (
    task: GoalRecord["tasks"][number],
    status: "todo" | "missed"
  ) => void;
  onSaveTaskReflection: (
    task: GoalRecord["tasks"][number],
    reflection: { notes: string; evidence: string; actualMinutes?: number }
  ) => void;
  savingTask: number | null;
  attendance: Outputs["attendance"]["list"];
  attendanceBusy: boolean;
  onAttendance: (day: string, status: "showed_up" | "missed") => void;
  onClearAttendance: (day: string) => void;
  onRetryRoadmap: () => void;
  draftTitle: string;
  busy: boolean;
  assessments: Outputs["learning"]["assessments"]["list"][number][];
  assessmentsLoading: boolean;
  onGenerateAssessment: () => void;
  assessmentBusy: boolean;
  quizAnswers: Record<number, number[]>;
  setQuizAnswers: (value: Record<number, number[]>) => void;
  quizResult: { scorePercent: number; feedback: string; note: string } | null;
  onSubmitQuiz: (
    event: React.FormEvent<HTMLFormElement>,
    assessmentId: number,
    questionCount: number
  ) => void;
  assessmentSubmitting: boolean;
  onResourceReviewed: (id: number, reviewed: boolean) => void;
  onResourceBookmarked: (id: number, bookmarked: boolean) => void;
  resourceSearchQuery: string;
  setResourceSearchQuery: (value: string) => void;
  resourceSearchAvailable: boolean;
  resourceSearchProvider: string;
  resourceStatusLoading: boolean;
  resourceStatusError: string;
  onRetryResourceStatus: () => void;
  resourceSearchBusy: boolean;
  resourceSearchNotice: string;
  resourceSearchError: string;
  onSearchResources: () => void;
  onSendMessage: (event: React.FormEvent<HTMLFormElement>) => void;
  chatInput: string;
  setChatInput: (value: string) => void;
  chatMessages: Outputs["learning"]["coach"]["history"][number][];
  chatLoading: boolean;
  coachBusy: boolean;
  onSuggestAdjustment: () => void;
  adjustmentBusy: boolean;
  onResolveAdjustment: (id: number, decision: "accept" | "dismiss") => void;
  adjustmentBusyId: number | null;
  onStatus: (status: "active" | "paused" | "completed" | "archived") => void;
  onDelete: () => void;
}) {
  const { goal } = props;
  const [attendanceDate, setAttendanceDate] = useState(localDay());
  const progress = progressOf(goal);
  const doneCount = goal.tasks.filter(
    task => task.progress?.status === "completed"
  ).length;
  const tasks = [...goal.tasks].sort(
    (a, b) => a.dayOffset - b.dayOffset || a.sortOrder - b.sortOrder
  );
  const resources = goal.resources;
  const [resourceFilter, setResourceFilter] = useState<ResourceFilter>("all");
  const [bookmarksOnly, setBookmarksOnly] = useState(false);
  const [resourceSort, setResourceSort] = useState<"newest" | "title" | "type">("newest");
  const visibleResources = resources
    .filter(resource => (resourceFilter === "all" || resourceCategory(resource) === resourceFilter) && (!bookmarksOnly || Boolean(resource.bookmarkedAt)))
    .sort((left, right) => resourceSort === "title"
      ? left.title.localeCompare(right.title)
      : resourceSort === "type"
        ? resourceCategory(left).localeCompare(resourceCategory(right)) || left.title.localeCompare(right.title)
        : new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const today = localDay();
  const startDate = goal.startDate ?? dateOnlyFromTimestamp(goal.startedAt);
  const attendanceByDay = new Map(props.attendance.map(item => [dateOnlyFromTimestamp(item.day), item.status]));
  const attendanceDays = goalAttendanceDates(startDate, Math.min(730, Math.max(1, goal.durationDays))).map(key => {
    const [year, month, day] = key.split("-").map(Number);
    return {
      key,
      day: new Date(Date.UTC(year, month - 1, day, 12)),
      status: attendanceByDay.get(key) ?? null,
      future: key > today,
      current: key === today,
    };
  });
  const goalEndDate = attendanceDays[attendanceDays.length - 1].key;
  const lastEditableAttendanceDate = goalEndDate < today ? goalEndDate : today;
  const canEditAttendance = lastEditableAttendanceDate >= startDate;
  const selectedAttendanceDate = canEditAttendance
    ? attendanceDate < startDate || attendanceDate > lastEditableAttendanceDate ? lastEditableAttendanceDate : attendanceDate
    : startDate;
  const selectedAttendanceStatus = attendanceByDay.get(selectedAttendanceDate) ?? null;
  const attendedCount = attendanceDays.filter(item => item.status === "showed_up").length;
  const missedCount = attendanceDays.filter(item => item.status === "missed").length;
  const unmarkedCount = attendanceDays.filter(item => !item.future && !item.status).length;
  return (
    <main className="page workspace-page">
      <aside className="sidebar workspace-sidebar">
        <a
          className="sidebar-brand"
          href="/"
          onClick={event => {
            event.preventDefault();
            props.onBack();
          }}
        >
          <Brand />
        </a>
        <button className="side-link" onClick={props.onBack}>
          <span>←</span> Back to overview
        </button>
        <div className="workspace-label">CURRENT GOAL</div>
        <div className="current-goal-mini">
          <span className="goal-icon purple-icon">✳</span>
          <div>
            <b>{goal.title}</b>
            <small>
              {goal.durationDays} days · {goal.minutesPerDay} min/day
            </small>
          </div>
        </div>
        <div className="mini-progress">
          <div className="progress-line">
            <span style={{ width: `${progress}%` }} />
          </div>
          <div>
            <span>Progress</span>
            <b>{progress}%</b>
          </div>
        </div>
        <div className="workspace-label resource-label">GOAL WORKSPACE</div>
        {(
          [
            ["overview", "▦", "Overview"],
            ["roadmap", "⌁", "Roadmap"],
            ["daily", "◉", "Daily tasks"],
            ["resources", "↗", "Resources"],
            ["assessment", "✓", "Learning checks"],
            ["coach", "✳", "AI coach"],
          ] as [WorkspaceTab, string, string][]
        ).map(([tab, icon, label]) => (
          <button
            key={tab}
            className={`side-link ${props.tab === tab ? "active" : ""}`}
            onClick={() => props.setTab(tab)}
          >
            <span>{icon}</span> {label}
          </button>
        ))}
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-star">✳</span>
            <p>
              Consistency is a skill.
              <br />
              <b>Practice it today.</b>
            </p>
            <div className="tip-line">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
          <button className="side-link" onClick={props.toggleTheme}>
            <span>◐</span> Appearance{" "}
            <span className="side-count">{props.theme}</span>
          </button>
          <button className="profile-mini" onClick={props.onLogout}>
            <span className="profile-avatar">{initials(props.user.name)}</span>
            <span className="profile-meta">
              <b>{props.user.name}</b>
              <small>Sign out</small>
            </span>
            <span className="more">↗</span>
          </button>
        </div>
      </aside>
      <section className="app-main workspace-main">
        <header className="app-topbar">
          <div className="mobile-brand">
            <a
              href="/"
              onClick={event => {
                event.preventDefault();
                props.onBack();
              }}
            >
              <Brand />
            </a>
          </div>
          <div className="breadcrumb">
            <button onClick={props.onBack}>Workspace</button>
            <span className="crumb-slash">/</span>
            <b>{goal.title}</b>
          </div>
          <div className="top-actions">
            <span className="coach-status">
              <span className="live-dot" /> AI goal partner
            </span>
            <button
              className="theme-toggle"
              onClick={props.toggleTheme}
              aria-label="Toggle color theme"
            >
              {props.theme === "dark" ? "☀" : "☾"}
            </button>
          </div>
        </header>
        <div className="workspace-layout">
          <div className="workspace-left">
            <div className="workspace-tabs">
              {(
                [
                  ["overview", "Overview"],
                  ["roadmap", "Roadmap"],
                  ["daily", "Daily tasks"],
                  ["resources", "Resources"],
                  ["assessment", "Learning check"],
                  ["coach", "Coach"],
                ] as [WorkspaceTab, string][]
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  className={`work-tab ${props.tab === tab ? "active" : ""}`}
                  onClick={() => props.setTab(tab)}
                >
                  {label}
                </button>
              ))}
            </div>
            {goal.status === "draft" && (
              <div className="aura-error aura-section">
                <b>Roadmap not ready yet.</b> Your goal draft is saved.{" "}
                {props.draftTitle && <span>{props.draftTitle} </span>}
                <button
                  className="btn btn-primary"
                  onClick={props.onRetryRoadmap}
                  disabled={props.busy}
                >
                  {props.busy ? "Generating…" : "Retry AI roadmap"}
                </button>
              </div>
            )}
            {props.tab === "overview" && (
              <section className="tab-panel goal-overview-page">
                <div className="goal-overview-panel">
                  <div className="goal-title-line">
                    <span className="goal-icon purple-icon">✳</span>
                    <span className="goal-status">
                      <i /> {goal.status.toUpperCase()} GOAL
                    </span>
                    <button
                      className="dots-button"
                      aria-label="Goal actions"
                      onClick={() => {
                        const next = window.prompt(
                          "Type: pause, resume, complete, or archive",
                          goal.status === "paused" ? "resume" : "pause"
                        );
                        if (next === "pause" || next === "resume")
                          props.onStatus(
                            next === "pause" ? "paused" : "active"
                          );
                        else if (next === "complete" || next === "archive")
                          props.onStatus(
                            next === "complete" ? "completed" : "archived"
                          );
                      }}
                    >
                      ···
                    </button>
                  </div>
                  <p className="eyebrow">YOUR NORTH STAR</p>
                  <h1>{goal.title}</h1>
                  <p className="muted">{goal.description}</p>
                  <div className="goal-metrics">
                    <div>
                      <small>PROGRESS</small>
                      <b>{progress}%</b>
                    </div>
                    <div>
                      <small>DAYS</small>
                      <b>{goal.durationDays}</b>
                    </div>
                    <div>
                      <small>DAILY COMMITMENT</small>
                      <b>{goal.minutesPerDay}m</b>
                    </div>
                  </div>
                  <div className="progress-line">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="overview-detail-grid">
                  <article className="overview-detail-card">
                    <p className="eyebrow">WHY THIS MATTERS</p>
                    <h3>Your goal</h3>
                    <p>{goal.description}</p>
                  </article>
                  <article className="overview-detail-card">
                    <p className="eyebrow">SUCCESS CRITERIA</p>
                    <h3>What success looks like</h3>
                    <p>
                      {goal.successCriteria ||
                        "No success criteria added yet. Edit goal details from Preferences."}
                    </p>
                  </article>
                  <article className="overview-detail-card">
                    <p className="eyebrow">YOUR REQUIREMENTS</p>
                    <h3>Time & constraints</h3>
                    <p>
                      {goal.skillLevel} · {goal.minutesPerDay} min/day ·{" "}
                      {goal.constraints || "No additional constraints noted."}
                    </p>
                  </article>
                </div>
                <div className="aura-card aura-section">
                  <div className="aura-between">
                    <div>
                      <p className="eyebrow">MEASURED FROM SAVED ACTIVITY</p>
                      <h3>Task progress</h3>
                    </div>
                    <span className="aura-chip">
                      {doneCount} / {goal.tasks.length}
                    </span>
                  </div>
                  <div className="aura-progress">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <p className="aura-muted">
                    Task completion is self-reported. Assessment results are
                    separate evidence and don't guarantee real-world mastery.
                  </p>
                </div>
                <div className="aura-card aura-section">
                  <div className="aura-between">
                    <div>
                      <p className="eyebrow">CONSISTENCY, NOT PERFECTION</p>
                      <h3>Attendance check-in</h3>
                      <p className="aura-muted">{goal.durationDays} days · {new Date(`${startDate}T12:00:00.000Z`).toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" })} to {new Date(`${attendanceDays[attendanceDays.length - 1].key}T12:00:00.000Z`).toLocaleDateString("en", { dateStyle: "medium", timeZone: "UTC" })}</p>
                    </div>
                    <span className="aura-chip">{attendedCount} attended · {missedCount} missed</span>
                  </div>
                  <div className="attendance-summary" aria-live="polite">
                    <span>{unmarkedCount} unmarked past/current day{unmarkedCount === 1 ? "" : "s"}</span>
                    <span>Unmarked does not mean missed.</span>
                  </div>
                  <div className="attendance-date-picker">
                    <label htmlFor="attendance-date-select">Choose a goal date</label>
                    <input
                      id="attendance-date-select"
                      type="date"
                      min={startDate}
                      max={lastEditableAttendanceDate}
                      value={selectedAttendanceDate}
                      onChange={event => setAttendanceDate(event.target.value)}
                      disabled={!canEditAttendance || props.attendanceBusy}
                      aria-describedby="attendance-date-help"
                    />
                    <span className={`attendance-status attendance-status-${selectedAttendanceStatus ?? "empty"}`}>
                      {selectedAttendanceStatus === "showed_up" ? "Present" : selectedAttendanceStatus === "missed" ? "Missed" : canEditAttendance ? "Not checked in" : "Not started"}
                    </span>
                    <div className="attendance-date-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => props.onAttendance(selectedAttendanceDate, "showed_up")} disabled={!canEditAttendance || props.attendanceBusy || selectedAttendanceStatus === "showed_up"}>Mark Present</button>
                      <button type="button" className="btn btn-ghost" onClick={() => props.onAttendance(selectedAttendanceDate, "missed")} disabled={!canEditAttendance || props.attendanceBusy || selectedAttendanceStatus === "missed"}>Mark Missed</button>
                      {selectedAttendanceStatus !== null && canEditAttendance && <button type="button" className="attendance-clear-button" onClick={() => props.onClearAttendance(selectedAttendanceDate)} disabled={props.attendanceBusy}>Clear mark</button>}
                    </div>
                    <small id="attendance-date-help">Choose any past or current goal date. You can correct it later; future days cannot be marked. Unmarked dates stay neutral.</small>
                  </div>
                  <div className="attendance-calendar-list" role="list" aria-label={`All ${goal.durationDays} attendance dates for ${goal.title}`}>
                    {attendanceDays.map(item => {
                      const statusLabel = item.status === "showed_up" ? "Attended" : item.status === "missed" ? "Missed" : item.future ? "Upcoming" : "Not checked in";
                      return (
                        <div className="attendance-calendar-row" role="listitem" key={item.key}>
                          <div className="attendance-calendar-date">
                            <button type="button" className="attendance-select-date" aria-pressed={selectedAttendanceDate === item.key} onClick={() => setAttendanceDate(item.key)} disabled={item.future || props.attendanceBusy}>{item.day.toLocaleDateString("en", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</button>
                            <small>{item.day.toLocaleDateString("en", { weekday: "long", timeZone: "UTC" })}{item.current ? " · Today" : ""}</small>
                          </div>
                          <span className={`attendance-status attendance-status-${item.status ?? (item.future ? "upcoming" : "empty")}`}>{statusLabel}</span>
                          <div className="attendance-calendar-actions">
                            {!item.future && !item.current && item.status !== "showed_up" && <button type="button" onClick={() => props.onAttendance(item.key, "showed_up")} disabled={props.attendanceBusy}>Mark attended</button>}
                            {!item.future && !item.current && item.status !== "missed" && <button type="button" onClick={() => props.onAttendance(item.key, "missed")} disabled={props.attendanceBusy}>Mark missed</button>}
                            {!item.future && item.current && item.status !== null && <button type="button" onClick={() => props.onClearAttendance(item.key)} disabled={props.attendanceBusy}>Clear mark</button>}
                            {!item.future && !item.current && item.status !== null && <button type="button" className="attendance-clear-button" onClick={() => props.onClearAttendance(item.key)} disabled={props.attendanceBusy}>Clear</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="aura-muted">Check-ins are self-reported. You can correct any past day; a missed day is information, not failure.</p>
                </div>
                <section className="aura-section">
                  <div className="aura-between">
                    <div>
                      <p className="eyebrow">ADAPTIVE PLANNING</p>
                      <h3>Adjust with evidence</h3>
                    </div>
                    <button
                      className="btn btn-secondary"
                      onClick={props.onSuggestAdjustment}
                      disabled={props.adjustmentBusy}
                    >
                      {props.adjustmentBusy
                        ? "Reviewing activity…"
                        : "Suggest a plan update"}
                    </button>
                  </div>
                  <p className="aura-muted">
                    AURA-X uses saved completions and learning-check scores.
                    Nothing changes unless you accept a suggestion.
                  </p>
                  {goal.adjustments.map(adjustment => (
                    <article
                      key={adjustment.id}
                      className="aura-card aura-section"
                    >
                      <span className="aura-chip">REVIEW NEEDED</span>
                      <h3>{adjustment.suggestedChange}</h3>
                      <p>
                        <b>Why:</b> {adjustment.reason}
                      </p>
                      <p className="aura-muted">
                        Saved evidence: {adjustment.evidenceSummary}
                      </p>
                      <div className="aura-row">
                        <button
                          className="btn btn-primary"
                          onClick={() =>
                            props.onResolveAdjustment(adjustment.id, "accept")
                          }
                          disabled={props.adjustmentBusyId === adjustment.id}
                        >
                          Accept schedule change
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() =>
                            props.onResolveAdjustment(adjustment.id, "dismiss")
                          }
                        >
                          Dismiss
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              </section>
            )}
            {props.tab === "roadmap" && (
              <section className="tab-panel aura-section">
                <div className="tab-panel-heading">
                  <div>
                    <p className="eyebrow">YOUR PERSONAL ROUTE</p>
                    <h2>Milestones & weekly objectives</h2>
                  </div>
                  {goal.roadmap && (
                    <span className="date-pill">
                      VERSION {goal.roadmap.version}
                    </span>
                  )}
                </div>
                {goal.roadmap ? (
                  <>
                    <p className="muted">{goal.roadmap.refinedGoal}</p>
                    {goal.roadmap.assumptions.length > 0 && (
                      <p className="aura-muted">
                        <b>Assumptions:</b>{" "}
                        {goal.roadmap.assumptions.join(" · ")}
                      </p>
                    )}
                    <div className="aura-stack aura-section">
                      {goal.roadmap.milestones.map((milestone, index) => {
                        const milestoneTasks = tasks.filter(
                          task => task.milestoneId === milestone.id
                        );
                        return (
                          <article className="aura-card" key={milestone.id}>
                            <div className="aura-between">
                              <span className="aura-chip">
                                WEEK {milestone.weekNumber}
                              </span>
                              <span className="aura-chip">
                                {milestone.status}
                              </span>
                            </div>
                            <h3>{milestone.title}</h3>
                            <p className="aura-muted">
                              {milestone.description}
                            </p>
                            <p>
                              <b>Completion:</b> {milestone.successCriteria}
                            </p>
                            <p className="aura-muted">
                              {milestoneTasks.length} scheduled task
                              {milestoneTasks.length === 1 ? "" : "s"} ·{" "}
                              {
                                milestoneTasks.filter(
                                  task => task.progress?.status === "completed"
                                ).length
                              }{" "}
                              completed
                            </p>
                          </article>
                        );
                      })}
                    </div>
                    <div className="aura-card aura-section">
                      <p className="eyebrow">WEEKLY OBJECTIVES</p>
                      {goal.roadmap.weeklyObjectives.map((objective, index) => (
                        <div
                          className="activity-row"
                          key={`${index}-${objective}`}
                        >
                          <span className="tiny-dot purple" />
                          <span className="activity-row-info">
                            <b>Week {index + 1}</b>
                            <small>{objective}</small>
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="aura-empty">
                    <h3>Roadmap waiting to be generated</h3>
                    <p>
                      Your saved draft will stay here until the AI service
                      returns a validated plan.
                    </p>
                    <button
                      className="btn btn-primary"
                      onClick={props.onRetryRoadmap}
                      disabled={props.busy}
                    >
                      {props.busy ? "Generating…" : "Generate roadmap"}
                    </button>
                  </div>
                )}
              </section>
            )}
            {props.tab === "daily" && (
              <section className="tab-panel aura-section">
                <div className="tab-panel-heading">
                  <div>
                    <p className="eyebrow">SHOW UP, ONE STEP AT A TIME</p>
                    <h2>Daily tasks</h2>
                  </div>
                  <span className="date-pill">
                    {doneCount} / {tasks.length} COMPLETE
                  </span>
                </div>
                <p className="muted">
                  Mark tasks complete when you finish them. Notes and evidence
                  remain attached to the task record.
                </p>
                {tasks.length ? (
                  <div className="aura-card aura-section">
                    {tasks.map(task => {
                      const completed = task.progress?.status === "completed";
                      return (
                        <div
                          key={task.id}
                          className={`aura-task ${completed ? "done" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={completed}
                            disabled={props.savingTask === task.id}
                            onChange={event =>
                              props.onTaskDone(goal, task, event.target.checked)
                            }
                            aria-label={`${completed ? "Reopen" : "Complete"} ${task.title}`}
                          />
                          <div>
                            <div className="aura-task-title">{task.title}</div>
                            <p className="aura-muted">{task.description}</p>
                            <div className="aura-row">
                              <span className="aura-chip">
                                {task.estimatedMinutes} min
                              </span>
                              <span className="aura-chip">
                                {readableDate(task.dueAt)}
                              </span>
                              <span className="aura-chip">{task.priority}</span>
                              {task.requiredSkill && (
                                <span className="aura-chip">
                                  {task.requiredSkill}
                                </span>
                              )}
                            </div>
                            <p className="aura-muted">
                              <b>Completion:</b> {task.completionCriteria}
                            </p>
                            <TaskReflection
                              task={task}
                              progress={task.progress}
                              disabled={props.savingTask === task.id}
                              onSave={reflection => props.onSaveTaskReflection(task, reflection)}
                            />
                            {task.progress?.status !== "completed" && task.progress?.status !== "missed" && task.dueAt && localDay(new Date(task.dueAt)) <= today && (
                              <button className="btn btn-ghost task-action" onClick={() => props.onTaskState(task, "missed")} disabled={props.savingTask === task.id}>Mark missed</button>
                            )}
                            {task.progress?.status === "missed" && (
                              <button className="btn btn-ghost task-action" onClick={() => props.onTaskState(task, "todo")} disabled={props.savingTask === task.id}>Move back to to-do</button>
                            )}
                          </div>
                          <span className="aura-chip">
                            {task.progress?.status || "todo"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="aura-empty">
                    <h3>No roadmap tasks yet</h3>
                    <p>Generate your roadmap to get a practical first step.</p>
                  </div>
                )}
              </section>
            )}
            {props.tab === "resources" && (
              <section className="tab-panel aura-section">
                <div className="tab-panel-heading">
                  <div>
                    <p className="eyebrow">LEARN, THEN PRACTICE</p>
                    <h2>Learning resources</h2>
                  </div>
                  <div className="aura-between">
                    <span className="date-pill">{resources.length} SAVED</span>
                    <button
                      className="btn btn-primary"
                      onClick={props.onSearchResources}
                      disabled={props.resourceStatusLoading || !props.resourceSearchAvailable || props.resourceSearchBusy}
                    >
                      {props.resourceSearchBusy ? "Searching…" : props.resourceSearchError ? "Retry search" : "Find resources"}
                    </button>
                  </div>
                </div>
                <p className="muted">
                  AI suggestions are not independently verified unless
                  explicitly marked. Check a link before relying on it.
                </p>
                <label className="resource-search-query">
                  <span>Optional search phrase within this goal</span>
                  <input type="search" value={props.resourceSearchQuery} onChange={event => props.setResourceSearchQuery(event.target.value)} maxLength={140} placeholder={`e.g., a topic related to ${goal.title}`} aria-label="Optional resource topic within this goal" />
                </label>
                {props.resourceStatusLoading ? (
                  <div className="aura-card"><p className="aura-muted">Checking live resource search…</p></div>
                ) : props.resourceStatusError ? (
                  <div className="aura-error resource-search-message" role="alert">
                    Provider status could not be checked: {props.resourceStatusError}{" "}
                    <button className="btn btn-ghost" onClick={props.onRetryResourceStatus}>Retry status check</button>
                  </div>
                ) : !props.resourceSearchAvailable ? (
                  <div className="aura-card">
                    <h3>Live resource search is unavailable</h3>
                    <p className="aura-muted">
                      The real resource providers could not be reached. Please try again later; AURA-X never fills this area with invented links.
                    </p>
                    <button className="btn btn-secondary" onClick={props.onRetryResourceStatus}>Retry provider check</button>
                  </div>
                ) : (
                  <div className="aura-card resource-search-ready">
                    <p className="aura-muted">Live providers: {props.resourceSearchProvider}. Results are matched to this goal; AURA-X saves only fresh HTTPS links returned by a provider.</p>
                  </div>
                )}
                {props.resourceSearchError && (
                  <div className="aura-error resource-search-message" role="alert">
                    <b>Search didn’t finish.</b> {props.resourceSearchError} Retry when you’re ready.
                  </div>
                )}
                {props.resourceSearchNotice && (
                  <div className={`resource-search-message ${props.resourceSearchNotice.includes("Unavailable this time") ? "resource-search-partial" : "aura-success"}`} role="status" aria-live="polite">
                    {props.resourceSearchNotice}
                  </div>
                )}
                <div className="resource-filter-tabs" role="group" aria-label="Filter saved resources">
                  {(["all", "course", "video", "book", "paper", "article", "dataset", "project", "practice", "tutorial"] as ResourceFilter[]).map(filter => {
                    const count = filter === "all" ? resources.length : resources.filter(resource => resourceCategory(resource) === filter).length;
                    const labels: Record<ResourceFilter, string> = { all: "All", course: "Courses", video: "Videos", book: "Books", article: "Articles", paper: "Papers", dataset: "Datasets", project: "Projects", practice: "Practice/Q&A", tutorial: "Tutorials" };
                    const label = labels[filter];
                    return <button type="button" key={filter} className={`resource-filter-tab ${resourceFilter === filter ? "active" : ""}`} aria-pressed={resourceFilter === filter} onClick={() => setResourceFilter(filter)}>{label}<span>{count}</span></button>;
                  })}
                </div>
                <div className="resource-controls-row">
                  <label className="resource-sort-control">Sort
                    <select value={resourceSort} onChange={event => setResourceSort(event.target.value as "newest" | "title" | "type")}>
                      <option value="newest">Recently saved</option>
                      <option value="title">Title A–Z</option>
                      <option value="type">Resource type</option>
                    </select>
                  </label>
                  <label className="resource-bookmarks-control">
                    <input type="checkbox" checked={bookmarksOnly} onChange={event => setBookmarksOnly(event.target.checked)} />
                    <span>Bookmarks only</span>
                  </label>
                </div>
                {resources.length ? (
                  visibleResources.length ? (
                  <div className="aura-stack aura-section">
                    {visibleResources.map(resource => (
                      <article className="aura-card" key={resource.id}>
                        <div className="aura-between">
                          <div className="resource-badges">
                            <span className="aura-chip">{resourceCategory(resource)}</span>
                            <span className="aura-chip resource-provider-chip">{resourceProvider(resource.url, resource.description)}</span>
                          </div>
                          <button
                            className="btn btn-ghost"
                            onClick={() =>
                              props.onResourceReviewed(
                                resource.id,
                                !resource.reviewedAt
                              )
                            }
                          >
                            {resource.reviewedAt
                              ? "Reviewed ✓"
                              : "Mark reviewed"}
                          </button>
                          <button type="button" className={`btn btn-ghost ${resource.bookmarkedAt ? "resource-bookmarked" : ""}`} aria-pressed={Boolean(resource.bookmarkedAt)} onClick={() => props.onResourceBookmarked(resource.id, !resource.bookmarkedAt)}>
                            {resource.bookmarkedAt ? "Remove bookmark" : "Bookmark"}
                          </button>
                        </div>
                        <h3>{resource.title}</h3>
                        <p className="aura-muted">{resource.description}</p>
                        {resource.url && (
                          <>
                            <a
                              className="text-button"
                              href={resource.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Open resource ↗
                            </a>
                            {!resource.urlVerified && (
                              <div className="aura-link-unverified">
                                This link has not been independently verified by
                                AURA-X.
                              </div>
                            )}
                          </>
                        )}
                      </article>
                    ))}
                  </div>
                  ) : (
                    <div className="aura-empty aura-section">
                      <h3>{bookmarksOnly ? "No bookmarked resources yet" : `No ${resourceFilter === "video" ? "videos" : `${resourceFilter}s`} saved yet`}</h3>
                      <p>{bookmarksOnly ? "Bookmark any resource to keep it here for quick access." : "Try another filter or find live resources matched to this goal."}</p>
                    </div>
                  )
                ) : (
                  <div className="aura-empty">
                    <h3>No resources saved yet</h3>
                    <p>
                      Search live providers for resources linked to this goal: books, courses, papers, articles, videos, datasets, projects, exercises and community Q&A.
                    </p>
                    <button className="btn btn-secondary" onClick={props.onSearchResources} disabled={props.resourceStatusLoading || !props.resourceSearchAvailable || props.resourceSearchBusy}>{props.resourceSearchBusy ? "Searching…" : "Find goal resources"}</button>
                  </div>
                )}
              </section>
            )}
            {props.tab === "assessment" && (
              <section className="tab-panel aura-section">
                <div className="tab-panel-heading">
                  <div>
                    <p className="eyebrow">CHECK YOUR UNDERSTANDING</p>
                    <h2>Learning checks</h2>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={props.onGenerateAssessment}
                    disabled={props.assessmentBusy}
                  >
                    {props.assessmentBusy ? "Preparing…" : "＋ Create a quiz"}
                  </button>
                </div>
                <p className="muted">
                  Automated quiz scores are one learning signal, not proof of
                  practical ability or real-world mastery.
                </p>
                {props.quizResult && (
                  <div className="aura-card aura-section">
                    <span className="aura-chip">
                      {props.quizResult.scorePercent}%
                    </span>
                    <h3>Your result</h3>
                    <p className="aura-muted">{props.quizResult.note}</p>
                    <pre className="aura-feedback">
                      {props.quizResult.feedback}
                    </pre>
                  </div>
                )}
                {props.assessmentsLoading ? (
                  <p className="aura-muted">Loading saved learning checks…</p>
                ) : props.assessments.length ? (
                  <div className="aura-stack aura-section">
                    {props.assessments.map(assessment => (
                      <article className="aura-card" key={assessment.id}>
                        <div className="aura-between">
                          <h3>{assessment.title}</h3>
                          <span className="aura-chip">
                            {assessment.questions.length} questions
                          </span>
                        </div>
                        <p className="aura-muted">{assessment.instructions}</p>
                        {assessment.attempts[0] && (
                          <p className="aura-chip">
                            Latest saved score:{" "}
                            {assessment.attempts[0].scorePercent}%
                          </p>
                        )}
                        <form
                          onSubmit={event =>
                            props.onSubmitQuiz(
                              event,
                              assessment.id,
                              assessment.questions.length
                            )
                          }
                        >
                          {assessment.questions.map(
                            (question, questionIndex) => (
                              <fieldset
                                className="aura-quiz-question"
                                key={`${assessment.id}-${questionIndex}`}
                              >
                                <legend>
                                  {questionIndex + 1}. {question.prompt}
                                </legend>
                                <div className="aura-quiz-options">
                                  {question.options.map(
                                    (option, optionIndex) => (
                                      <label
                                        className="aura-quiz-option"
                                        key={optionIndex}
                                      >
                                        <input
                                          type="radio"
                                          name={`assessment-${assessment.id}-question-${questionIndex}`}
                                          value={optionIndex}
                                          checked={
                                            props.quizAnswers[assessment.id]?.[
                                              questionIndex
                                            ] === optionIndex
                                          }
                                          onChange={() => {
                                            const current =
                                              props.quizAnswers[
                                                assessment.id
                                              ] ||
                                              Array(
                                                assessment.questions.length
                                              ).fill(-1);
                                            const next = [...current];
                                            next[questionIndex] = optionIndex;
                                            props.setQuizAnswers({
                                              ...props.quizAnswers,
                                              [assessment.id]: next,
                                            });
                                          }}
                                          required
                                        />
                                        <span>{option}</span>
                                      </label>
                                    )
                                  )}
                                </div>
                              </fieldset>
                            )
                          )}
                          <button
                            className="btn btn-secondary"
                            type="submit"
                            disabled={props.assessmentSubmitting}
                          >
                            {props.assessmentSubmitting
                              ? "Saving result…"
                              : "Submit learning check"}
                          </button>
                        </form>
                      </article>
                    ))}
                  </div>
                ) : (
                  !props.quizResult && (
                    <div className="aura-empty">
                      <h3>No learning checks yet</h3>
                      <p>
                        Create a short AI-generated quiz based on this goal and
                        its saved roadmap.
                      </p>
                    </div>
                  )
                )}
              </section>
            )}
            {props.tab === "coach" && (
              <section className="tab-panel aura-section">
                <div className="tab-panel-heading">
                  <div>
                    <p className="eyebrow">YOUR AI GOAL PARTNER</p>
                    <h2>Ask about the next step</h2>
                  </div>
                  <span className="aura-chip">
                    <span className="live-dot" /> Saved-context coach
                  </span>
                </div>
                <p className="muted">
                  The coach uses this goal and its saved task activity. It won't
                  silently edit your roadmap.
                </p>
                <div className="aura-chat-thread">
                  {props.chatLoading ? (
                    <p className="aura-muted">Loading conversation…</p>
                  ) : props.chatMessages.length ? (
                    props.chatMessages.map(message => (
                      <div
                        className={`aura-message ${message.role}`}
                        key={message.id}
                      >
                        {message.content}
                      </div>
                    ))
                  ) : (
                    <div className="aura-message assistant">
                      Tell me where you feel stuck, or ask for a practical next
                      move. I'll keep the advice tied to this goal.
                    </div>
                  )}
                  {props.coachBusy && (
                    <div className="aura-message assistant">
                      Thinking through your saved progress…
                    </div>
                  )}
                </div>
                <form
                  className="chat-compose aura-section"
                  onSubmit={props.onSendMessage}
                >
                  <textarea
                    value={props.chatInput}
                    onChange={event => props.setChatInput(event.target.value)}
                    maxLength={2000}
                    rows={3}
                    placeholder="Ask about your goal, request a plan, or get unstuck…"
                    aria-label="Message your AURA-X coach"
                  />
                  <button
                    className="send-button"
                    type="submit"
                    aria-label="Send message"
                    disabled={props.coachBusy || !props.chatInput.trim()}
                  >
                    ↑
                  </button>
                  <div className="compose-foot">
                    <span>↳ AURA helps you plan, practice, and reflect.</span>
                    <span>AI responses can be wrong; review suggestions.</span>
                  </div>
                </form>
              </section>
            )}
            <footer className="app-footer">
              <span>© AURA X · PERSONAL GOAL OS</span>
              <span>
                Task completion is self-reported <b>✳</b>
              </span>
            </footer>
          </div>
        </div>
      </section>
    </main>
  );
}

function TaskReflection({
  task,
  progress,
  disabled,
  onSave,
}: {
  task: GoalRecord["tasks"][number];
  progress: GoalRecord["tasks"][number]["progress"];
  disabled: boolean;
  onSave: (reflection: { notes: string; evidence: string; actualMinutes?: number }) => void;
}) {
  const [notes, setNotes] = useState(progress?.notes ?? "");
  const [evidence, setEvidence] = useState(progress?.evidence ?? "");
  const [actualMinutes, setActualMinutes] = useState(progress?.actualMinutes?.toString() ?? "");
  useEffect(() => {
    setNotes(progress?.notes ?? "");
    setEvidence(progress?.evidence ?? "");
    setActualMinutes(progress?.actualMinutes?.toString() ?? "");
  }, [progress?.notes, progress?.evidence, progress?.actualMinutes]);
  return (
    <details className="aura-reflection">
      <summary>{progress?.notes || progress?.evidence ? "Edit reflection & evidence" : "Add reflection & evidence"}</summary>
      <form className="stack-form aura-section" onSubmit={event => { event.preventDefault(); onSave({ notes, evidence, actualMinutes: actualMinutes ? Number(actualMinutes) : undefined }); }}>
        <label className="field">What did you learn or notice?<textarea value={notes} onChange={event => setNotes(event.target.value)} maxLength={3000} rows={2} /></label>
        <label className="field">Evidence or work link<textarea value={evidence} onChange={event => setEvidence(event.target.value)} maxLength={3000} rows={2} placeholder="Optional: describe what you produced or add a reference." /></label>
        <label className="field">Actual minutes spent<input type="number" min={0} max={1440} value={actualMinutes} onChange={event => setActualMinutes(event.target.value)} /></label>
        <button className="btn btn-secondary" type="submit" disabled={disabled}>{disabled ? "Saving…" : "Save reflection"}</button>
      </form>
    </details>
  );
}

function SettingsScreen({
  user,
  profileName,
  setProfileName,
  currentPassword,
  setCurrentPassword,
  newPassword,
  setNewPassword,
  onProfile,
  onPassword,
  onDeleteAccount,
  onBack,
  busy,
}: {
  user: UserRecord;
  profileName: string;
  setProfileName: (name: string) => void;
  currentPassword: string;
  setCurrentPassword: (password: string) => void;
  newPassword: string;
  setNewPassword: (password: string) => void;
  onProfile: (event: React.FormEvent<HTMLFormElement>) => void;
  onPassword: (event: React.FormEvent<HTMLFormElement>) => void;
  onDeleteAccount: () => void;
  onBack: () => void;
  busy: boolean;
}) {
  return (
    <main className="page app-page">
      <aside className="sidebar">
        <a
          className="sidebar-brand"
          href="/"
          onClick={event => {
            event.preventDefault();
            onBack();
          }}
        >
          <Brand />
        </a>
        <div className="workspace-label">ACCOUNT</div>
        <button className="side-link active">
          <span>⚙</span> Preferences
        </button>
        <div className="sidebar-bottom">
          <button className="side-link" onClick={onBack}>
            <span>←</span> Back to overview
          </button>
        </div>
      </aside>
      <section className="app-main">
        <header className="app-topbar">
          <div className="breadcrumb">
            <button onClick={onBack}>Workspace</button>
            <span className="crumb-slash">/</span>
            <b>Preferences</b>
          </div>
          <div className="top-actions">
            <span className="date-label">ACCOUNT SETTINGS</span>
          </div>
        </header>
        <div className="dashboard-content">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">YOUR AURA-X ACCOUNT</p>
              <h1>Preferences</h1>
              <p className="muted">
                Update your profile, password and account data.
              </p>
            </div>
          </div>
          <div className="aura-stack">
            <article className="aura-card">
              <p className="eyebrow">PROFILE</p>
              <h3>Personal details</h3>
              <p className="aura-muted">Signed in as {user.email}</p>
              <form className="stack-form aura-section" onSubmit={onProfile}>
                <label className="field">
                  Your name
                  <input
                    value={profileName}
                    onChange={event => setProfileName(event.target.value)}
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </label>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={busy}
                >
                  Save profile
                </button>
              </form>
            </article>
            <article className="aura-card">
              <p className="eyebrow">PASSWORD</p>
              <h3>Change password</h3>
              <p className="aura-muted">
                Choose at least 10 characters. Password reset by email is not
                enabled until email delivery is configured.
              </p>
              <form className="stack-form aura-section" onSubmit={onPassword}>
                <label className="field">
                  Current password
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={event => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label className="field">
                  New password
                  <input
                    type="password"
                    value={newPassword}
                    onChange={event => setNewPassword(event.target.value)}
                    minLength={10}
                    maxLength={128}
                    autoComplete="new-password"
                    required
                  />
                </label>
                <button
                  className="btn btn-secondary"
                  type="submit"
                  disabled={busy}
                >
                  Update password
                </button>
              </form>
            </article>
            <article className="aura-card">
              <p className="eyebrow">DATA CONTROL</p>
              <h3>Delete account and data</h3>
              <p className="aura-muted">
                This permanently removes your account, goals, roadmaps, tasks,
                resources, assessments, attempts and saved progress.
              </p>
              <button
                className="btn btn-danger"
                onClick={onDeleteAccount}
                disabled={busy}
              >
                Delete my account
              </button>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
