import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Notice,
  RemoteState,
  send,
  useAction,
  useRemote,
} from "@/lib/workspace";
interface Attempt {
  id: number;
  status: string;
  score: number | null;
  questions: { prompt: string; choices: string[] }[];
  answers: Record<string, number> | null;
  feedback?: boolean[];
}
interface QuizInfo {
  quiz: { id: number; attempts_allowed: number; time_limit_sec?: number };
  attempts: Attempt[];
}
export function QuizPlayer({ resourceId }: { resourceId: number }) {
  const remote = useRemote<QuizInfo>(`/api/v1/resources/${resourceId}/quiz`);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const action = useAction();
  function select(a: Attempt) {
    setAttempt(a);
    setAnswers(a.answers ?? {});
  }
  if (!remote.data)
    return <RemoteState error={remote.error} retry={remote.reload} />;
  const info = remote.data;
  const draft = info.attempts.find((a) => a.status === "draft");
  const spent = info.attempts.filter((a) => a.status === "submitted").length;
  async function save(submit: boolean) {
    if (!attempt) return;
    await action.run(
      async () => {
        const saved = await send<Attempt>(
          `/api/v1/attempts/${attempt.id}`,
          "PUT",
          { answers },
        );
        if (submit) {
          const result = await send<Attempt>(
            `/api/v1/attempts/${attempt.id}/submit`,
            "POST",
          );
          select(result.data);
          remote.reload();
        } else select(saved.data);
      },
      submit ? "Evaluación enviada" : "Respuestas guardadas",
    );
  }
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {info.quiz.attempts_allowed} intentos permitidos · {spent} enviados
        {info.quiz.time_limit_sec
          ? ` · Límite: ${info.quiz.time_limit_sec} segundos por intento`
          : " · Sin límite de tiempo"}
      </p>
      {action.error && <Notice>{action.error}</Notice>}
      {!attempt && (
        <Button
          disabled={
            action.busy || (!draft && spent >= info.quiz.attempts_allowed)
          }
          onClick={() =>
            action.run(async () => {
              const r = await send<Attempt>(
                `/api/v1/quizzes/${info.quiz.id}/attempts`,
                "POST",
              );
              select(r.data);
            })
          }
        >
          {draft
            ? "Retomar intento"
            : spent >= info.quiz.attempts_allowed
              ? "Intentos agotados"
              : "Comenzar quiz"}
        </Button>
      )}
      {attempt && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">
              {attempt.status === "submitted"
                ? `Resultado: ${attempt.score ?? 0} / 100`
                : "Tu evaluación"}
            </h2>
            <Button variant="ghost" onClick={() => setAttempt(null)}>
              Volver a mis intentos
            </Button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(true);
            }}
            className="space-y-6"
          >
            {attempt.questions.map((q, i) => (
              <fieldset
                disabled={attempt.status !== "draft" || action.busy}
                key={i}
                className="rounded-xl border bg-card p-5"
              >
                <legend className="max-w-full px-2 font-semibold">
                  {i + 1}. {q.prompt}
                </legend>
                <div className="space-y-2">
                  {q.choices.map((choice, j) => (
                    <label
                      key={j}
                      className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-muted"
                    >
                      <input
                        type="radio"
                        name={`question-${i}`}
                        value={j}
                        required
                        checked={answers[String(i)] === j}
                        onChange={() => setAnswers({ ...answers, [i]: j })}
                        className="mt-1 accent-primary"
                      />
                      <span>{choice}</span>
                    </label>
                  ))}
                </div>
                {attempt.feedback && (
                  <p className="mt-3 text-sm font-medium">
                    {attempt.feedback[i]
                      ? "Respuesta correcta"
                      : "Respuesta incorrecta"}
                  </p>
                )}
              </fieldset>
            ))}
            {attempt.status === "draft" && (
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={action.busy}
                  onClick={() => void save(false)}
                >
                  Guardar respuestas
                </Button>
                <Button type="submit" disabled={action.busy}>
                  {action.busy ? "Enviando…" : "Enviar evaluación"}
                </Button>
              </div>
            )}
          </form>
        </>
      )}
      {info.attempts.length > 0 && (
        <section className="border-t pt-5">
          <h2 className="font-semibold">Mis intentos</h2>
          <ul className="mt-2 divide-y">
            {info.attempts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between py-3 text-sm"
              >
                <span>
                  Intento #{a.id} ·{" "}
                  {a.status === "submitted"
                    ? `Nota: ${a.score} / 100`
                    : a.status === "draft"
                      ? "En curso"
                      : "Vencido"}
                </span>
                <Button variant="outline" size="sm" onClick={() => select(a)}>
                  {a.status === "draft" ? "Retomar" : "Ver resultado"}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
