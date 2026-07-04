"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [users, setUsers] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(0);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPass, setNewPass] = useState("");

  const railRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/auth/users")
      .then((r) => r.json())
      .then((d) => setUsers(Array.isArray(d.users) ? d.users : []))
      .catch(() => setUsers([]))
      .finally(() => setLoaded(true));
  }, []);

  // Slide the gold underline under the selected name.
  useLayoutEffect(() => {
    const rail = railRef.current;
    const bar = barRef.current;
    if (!rail || !bar) return;
    const el = rail.querySelectorAll<HTMLElement>("[data-name]")[selected];
    if (el) {
      bar.style.left = `${el.offsetLeft}px`;
      bar.style.width = `${el.offsetWidth}px`;
    } else {
      bar.style.width = "0px";
    }
  }, [selected, users, adding]);

  useEffect(() => {
    if (adding) nameRef.current?.focus();
    else if (users.length) passRef.current?.focus();
  }, [adding, users.length]);

  const pick = (i: number) => {
    setSelected(i);
    setError("");
    setPassword("");
    setTimeout(() => passRef.current?.focus(), 0);
  };

  const submit = async () => {
    const username = users[selected];
    if (!username || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Login failed.");
      setPassword("");
      passRef.current?.focus();
    } catch {
      setError("Couldn’t reach the server.");
    } finally {
      setSubmitting(false);
    }
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) {
      setError("Name required.");
      nameRef.current?.focus();
      return;
    }
    if (newPass.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name, password: newPass }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setUsers((u) => [...u, d.username]);
        setSelected(users.length);
        setAdding(false);
        setNewName("");
        setNewPass("");
        setError("");
      } else {
        setError(d.error ?? "Couldn’t create the profile.");
      }
    } catch {
      setError("Couldn’t reach the server.");
    }
  };

  return (
    <div className="login">
      <div className="login__wordmark">The Reader</div>

      <div className="login__stack">
        <div className="login__eyebrow">Who&rsquo;s reading</div>

        <div className="login__rail" ref={railRef}>
          {users.map((name, i) => (
            <button
              key={name}
              type="button"
              data-name
              data-active={i === selected}
              className="login__name"
              onClick={() => pick(i)}
            >
              {name}
            </button>
          ))}

          <div className="login__add">
            <button
              type="button"
              className="login__addbtn"
              data-open={adding}
              onClick={() => {
                setAdding((a) => !a);
                setError("");
              }}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M7.5 3v9M3 7.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <span>Add</span>
            </button>

            {adding && (
              <div className="login__card">
                <div className="login__card-label">New profile</div>
                <input
                  ref={nameRef}
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && create()}
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && create()}
                />
                <button type="button" className="login__create" onClick={create}>
                  Create profile
                </button>
              </div>
            )}
          </div>

          <div className="login__bar" ref={barRef} />
        </div>

        <div className="login__pass" data-error={!!error}>
          <input
            ref={passRef}
            type="password"
            placeholder={users.length ? "Password" : loaded ? "No profiles yet — add one" : "Loading…"}
            value={password}
            disabled={!users.length}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button
            type="button"
            className="login__go"
            aria-label="Sign in"
            onClick={submit}
            disabled={!users.length || submitting}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M3 9h11M9 4l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="login__error">{error}</div>

        {loaded && users.length === 0 && (
          <div className="login__hint">Create the first profile with the Add button above.</div>
        )}
      </div>
    </div>
  );
}
