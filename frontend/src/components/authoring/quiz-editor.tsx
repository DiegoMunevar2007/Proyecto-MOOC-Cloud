import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Field,
  control,
  Notice,
  RemoteState,
  send,
  useAction,
  useRemote,
} from "@/lib/workspace";
import { ApiError } from "@/lib/api";
import { useEffect } from "react";
import { api } from "@/lib/api";

interface Question {
  id: number;
  prompt: string;
  choices: string;
  correct_index: number;
}
interface Quiz {
  id: number;
  attempts_allowed: number;
}
function QuestionForm({
  quizId,
  question,
  after,
}: {
  quizId: number;
  question?: Question;
  after: () => void;
}) {
  const action = useAction();
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = new FormData(form);
    await action.run(async () => {
      const choices = String(values.get("choices"))
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean);
      const correct = Number(values.get("correct")) - 1;
      if (choices.length < 2 || correct < 0 || correct >= choices.length)
        throw new Error(
          "Escribe al menos dos opciones e indica el número de la respuesta correcta.",
        );
      const input = {
        prompt: values.get("prompt"),
        choices,
        correct_index: correct,
      };
      await send(
        `/api/v1/quizzes/${quizId}/questions${question ? `/${question.id}` : ""}`,
        question ? "PUT" : "POST",
        question ? input : { questions: [input] },
      );
      form.reset();
      after();
    }, "Pregunta guardada");
  }
  return (
    <form className="space-y-3" onSubmit={save}>
      <Field label="Pregunta">
        <textarea
          name="prompt"
          defaultValue={question?.prompt}
          required
          rows={2}
          className={control}
        />
      </Field>
      <Field label="Opciones (una por línea)">
        <textarea
          name="choices"
          defaultValue={
            question
              ? (JSON.parse(question.choices) as string[]).join("\n")
              : ""
          }
          required
          rows={4}
          className={control}
        />
      </Field>
      <Field label="Número de la opción correcta">
        <input
          name="correct"
          type="number"
          min={1}
          defaultValue={(question?.correct_index ?? 0) + 1}
          required
          className={control}
        />
      </Field>
      {action.error && <Notice>{action.error}</Notice>}
      <Button type="submit" disabled={action.busy}>
        {question ? "Guardar pregunta" : "Agregar pregunta"}
      </Button>
    </form>
  );
}
function Questions({ quiz, editable }: { quiz: Quiz; editable: boolean }) {
  const { data, error, reload } = useRemote<{ questions: Question[] }>(
    `/api/v1/quizzes/${quiz.id}`,
  );
  if (!data) return <RemoteState error={error} retry={reload} />;
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {quiz.attempts_allowed} intentos por estudiante. La calificación la
        calcula el servidor.
      </p>
      {(data.questions ?? []).map((q, i) => (
        <details key={q.id} className="rounded-lg border p-4">
          <summary className="cursor-pointer font-medium">
            {i + 1}. {q.prompt}
          </summary>
          <div className="mt-4">
            {editable ? (
              <QuestionForm quizId={quiz.id} question={q} after={reload} />
            ) : (
              <p className="text-sm">
                {(JSON.parse(q.choices) as string[]).join(" · ")}
              </p>
            )}
          </div>
        </details>
      ))}
      {editable && (
        <details
          open={!data.questions?.length}
          className="rounded-lg border border-dashed p-4"
        >
          <summary className="cursor-pointer font-medium text-primary">
            Agregar pregunta
          </summary>
          <div className="mt-4">
            <QuestionForm quizId={quiz.id} after={reload} />
          </div>
        </details>
      )}
    </div>
  );
}
export function QuizEditor({
  resourceId,
  editable,
}: {
  resourceId: number;
  editable: boolean;
}) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const action = useAction();
  useEffect(() => {
    const abort = new AbortController();
    api<{ quiz: Quiz }>(`/api/v1/resources/${resourceId}/quiz`, {
      signal: abort.signal,
    })
      .then((r) => setQuiz(r.data.quiz))
      .catch((e) => {
        if (abort.signal.aborted) return;
        if (e instanceof ApiError && e.status === 404) setMissing(true);
        else setError(e.message);
      });
    return () => abort.abort();
  }, [resourceId]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    await action.run(async () => {
      const r = await send<{ quiz: Quiz }>("/api/v1/quizzes", "POST", {
        resource_id: resourceId,
        attempts_allowed: Number(values.get("attempts")),
        feedback_policy: "on_submit",
      });
      setQuiz(r.data.quiz);
    }, "Quiz creado");
  }
  if (error) return <Notice>{error}</Notice>;
  if (quiz) return <Questions quiz={quiz} editable={editable} />;
  if (!missing) return <p role="status">Cargando quiz…</p>;
  return editable ? (
    <form onSubmit={create} className="space-y-3">
      <p>Configura los intentos y luego agrega las preguntas.</p>
      <Field label="Intentos permitidos">
        <input
          name="attempts"
          type="number"
          min={1}
          max={10}
          defaultValue={3}
          className={control}
          required
        />
      </Field>
      {action.error && <Notice>{action.error}</Notice>}
      <Button disabled={action.busy}>Crear quiz</Button>
    </form>
  ) : (
    <Notice>Este recurso no tiene un quiz configurado.</Notice>
  );
}
