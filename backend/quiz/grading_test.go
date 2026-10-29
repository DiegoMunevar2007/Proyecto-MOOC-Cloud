package quiz

import "testing"

func TestGradeUnansweredDoesNotMatchFirstChoice(t *testing.T) {
	questions := []SnapshotQuestion{{Correct: 0}, {Correct: 1}}
	for _, tc := range []struct {
		name    string
		answers map[string]int
		score   int
	}{
		{"sin respuestas", nil, 0}, {"parcial", map[string]int{"1": 1}, 50}, {"completo", map[string]int{"0": 0, "1": 1}, 100},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := Grade(questions, tc.answers); got != tc.score {
				t.Fatalf("nota=%d, esperada=%d", got, tc.score)
			}
		})
	}
}
