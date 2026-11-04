import { CircleCheck, ListChecks, Plus, Trash2 } from "lucide-react";

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function ProjectChecklist({
  requirements,
  mode = "progress",
  onChange,
  onToggle,
  disabled = false,
  saving = false,
  isClient = false,
}) {
  const isReview = mode === "review";
  const completed = requirements.filter((requirement) => requirement.isDone).length;
  const percentage = requirements.length
    ? (completed / requirements.length) * 100
    : 0;

  const updateRequirement = (id, condition) =>
    onChange(
      requirements.map((requirement) =>
        requirement.id === id ? { ...requirement, condition } : requirement
      )
    );

  const removeRequirement = (id) =>
    onChange(requirements.filter((requirement) => requirement.id !== id));

  const addRequirement = () =>
    onChange([
      ...requirements,
      { id: newId(), isDone: false, condition: "" },
    ]);

  return (
    <section
      className={`project-checklist${isReview ? " project-checklist-review" : ""}`}
      aria-label={isReview ? "Review project requirements" : "Project checklist"}
    >
      <div className="project-checklist-header">
        <div className="project-checklist-icon" aria-hidden="true">
          <ListChecks size={20} />
        </div>
        <div className="project-checklist-heading">
          <h3>{isReview ? "Review your checklist" : "Shared delivery checklist"}</h3>
          <p>
            {isReview
              ? "Refine the AI-generated requirements before sharing them with your freelancer."
              : "Track progress against the agreed project requirements."}
          </p>
        </div>
        <span
          className={`project-checklist-access${isReview || isClient ? " is-editor" : ""}`}
        >
          {isReview
            ? `${requirements.length} ${requirements.length === 1 ? "requirement" : "requirements"}`
            : isClient
              ? "Client updates"
              : "View only"}
        </span>
      </div>

      {!isReview && requirements.length > 0 && (
        <div className="requirement-progress">
          <div className="requirement-progress-info">
            <div className="requirement-progress-summary">
              <strong>
                {completed} of {requirements.length}
              </strong>
              <span>requirements completed</span>
            </div>
            <div className="requirement-progress-meta">
              {saving && <span className="requirement-saving">Saving...</span>}
              <span className="requirement-progress-percent">
                {Math.round(percentage)}%
              </span>
            </div>
          </div>

          <div
            className="requirement-progress-track"
            role="progressbar"
            aria-label="Completed requirements"
            aria-valuemin={0}
            aria-valuemax={requirements.length}
            aria-valuenow={completed}
          >
            <div
              className="requirement-progress-fill"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      )}

      {requirements.length === 0 ? (
        <p className="project-checklist-empty">
          {isReview
            ? "No requirements yet. Add the first requirement below."
            : "No requirements have been approved yet."}
        </p>
      ) : (
        <ul className="requirement-list">
          {requirements.map((requirement, index) => (
            <li
              key={requirement.id ?? index}
              className={`project-requirement${requirement.isDone ? " project-requirement-done" : ""}${isReview ? " project-requirement-editing" : ""}`}
            >
              {isReview ? (
                <>
                  <span className="project-requirement-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <textarea
                    className="project-requirement-input"
                    value={requirement.condition}
                    onChange={(event) =>
                      updateRequirement(requirement.id, event.target.value)
                    }
                    rows={2}
                    disabled={disabled}
                    aria-label={`Requirement ${index + 1}`}
                    placeholder="Describe what must be true for this to count as done"
                  />
                  <button
                    type="button"
                    className="project-requirement-remove"
                    aria-label={`Remove requirement ${index + 1}`}
                    onClick={() => removeRequirement(requirement.id)}
                    disabled={disabled}
                  >
                    <Trash2 size={17} />
                  </button>
                </>
              ) : (
                <>
                  <label
                    className={`project-requirement-label${isClient ? "" : " is-readonly"}`}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(requirement.isDone)}
                      disabled={!isClient || saving}
                      onChange={(event) => onToggle(index, event.target.checked)}
                      aria-label={`Mark requirement ${index + 1} as ${
                        requirement.isDone ? "incomplete" : "complete"
                      }`}
                    />
                    <span
                      className="project-requirement-check"
                      aria-hidden="true"
                    >
                      <CircleCheck size={18} />
                    </span>
                    <span className="project-requirement-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="project-requirement-condition">
                      {requirement.condition}
                    </span>
                  </label>
                  <span
                    className={`project-requirement-status${requirement.isDone ? " is-complete" : ""}`}
                  >
                    {requirement.isDone ? "Complete" : "To do"}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {isReview ? (
        <button
          type="button"
          className="project-checklist-add"
          onClick={addRequirement}
          disabled={disabled}
        >
          <Plus size={17} />
          Add requirement
        </button>
      ) : requirements.length > 0 ? (
        <p className="project-checklist-note">
          {isClient
            ? "Your updates are saved automatically and shared with the freelancer."
            : "This checklist is shared with the client. Only the client can update completion."}
        </p>
      ) : null}
    </section>
  );
}
