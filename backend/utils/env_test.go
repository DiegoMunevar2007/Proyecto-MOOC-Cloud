package utils

import (
	"os"
	"testing"
	"time"
)

func TestGetEnvInt(t *testing.T) {
	casos := []struct {
		valor string
		want  int
	}{
		{"", 7},
		{"12", 12},
		{"0", 7},
		{"-3", 7},
		{"diez", 7},
	}
	for _, c := range casos {
		t.Setenv("MOOC_TEST_INT", c.valor)
		if got := GetEnvInt("MOOC_TEST_INT", 7); got != c.want {
			t.Errorf("GetEnvInt(%q) = %d, se esperaba %d", c.valor, got, c.want)
		}
	}
}

func TestGetEnvDuration(t *testing.T) {
	casos := []struct {
		valor string
		want  time.Duration
	}{
		{"", 8 * time.Second},
		{"25s", 25 * time.Second},
		{"1m30s", 90 * time.Second},
		{"60", 60 * time.Second},
		{"0", 8 * time.Second},
		{"-5s", 8 * time.Second},
		{"pronto", 8 * time.Second},
	}
	for _, c := range casos {
		t.Setenv("MOOC_TEST_DURATION", c.valor)
		if got := GetEnvDuration("MOOC_TEST_DURATION", 8*time.Second); got != c.want {
			t.Errorf("GetEnvDuration(%q) = %s, se esperaba %s", c.valor, got, c.want)
		}
	}
}

func TestInstanceName(t *testing.T) {
	t.Setenv("INSTANCE_NAME", "mooc-api-x1y2")
	if got := InstanceName(); got != "mooc-api-x1y2" {
		t.Errorf("InstanceName() = %q, se esperaba el valor de INSTANCE_NAME", got)
	}

	t.Setenv("INSTANCE_NAME", "")
	host, _ := os.Hostname()
	if host == "" {
		host = "unknown"
	}
	if got := InstanceName(); got != host {
		t.Errorf("sin INSTANCE_NAME, InstanceName() = %q, se esperaba el hostname %q", got, host)
	}
}
