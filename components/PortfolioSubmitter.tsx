'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  classesForTeacherGrade,
  createPortfolioRequestTracker,
  gradesForTeacher,
  normalizeDestinationCatalog,
  parseStudentNumbers,
  submitPortfolioGroup,
  teacherLabel,
  updatePreviewObjectUrl,
} from '@/game/portfolio.js';

type TeacherChoice = {
  teacherId: string;
  subject: string;
  teacherName: string;
  classes: ClassChoice[];
};

type ClassChoice = {
  portfolioBaseUrl: string;
  teacherId: string;
  subject: string;
  teacherName: string;
  grade: string;
  classNo: string;
  displayName: string;
};

type Destination = {
  portfolioBaseUrl: string;
  teacherId: string;
  subject: string;
  teacherName: string;
  grade: string;
  classNo: string;
  studentNumbers: string;
};

const EMPTY: Destination = {
  portfolioBaseUrl: '',
  teacherId: '',
  subject: '',
  teacherName: '',
  grade: '',
  classNo: '',
  studentNumbers: '',
};

export function PortfolioSubmitter({
  playerName,
  title,
  description,
  makePngBlob,
  summary,
}: {
  playerName: string;
  title: string;
  description: string;
  makePngBlob: () => Promise<Blob>;
  summary: string;
}) {
  const baseUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'https://snug-portfolio.vercel.app';
    return new URLSearchParams(window.location.search).get('portfolioBaseUrl') || 'https://snug-portfolio.vercel.app';
  }, []);
  const apiUrl = useMemo(() => {
    if (typeof window === 'undefined') return `${baseUrl}/api/public/portfolio-destinations`;
    return new URLSearchParams(window.location.search).get('portfolioApiUrl') || `${baseUrl.replace(/\/$/, '')}/api/public/portfolio-destinations`;
  }, [baseUrl]);
  const [catalog, setCatalog] = useState<TeacherChoice[]>([]);
  const [catalogStatus, setCatalogStatus] = useState('제출 대상을 불러오는 중입니다.');
  const [destination, setDestination] = useState<Destination>({ ...EMPTY, portfolioBaseUrl: baseUrl });
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState('');
  const [retryNumbers, setRetryNumbers] = useState('');
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestTrackerRef = useRef(createPortfolioRequestTracker());

  useEffect(() => () => { requestTrackerRef.current.unmount(); }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  useEffect(() => {
    let alive = true;
    fetch(apiUrl, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(json => {
        if (!alive) return;
        const next = normalizeDestinationCatalog(json, baseUrl);
        setCatalog(next);
        setCatalogStatus(next.length ? '제출 대상을 선택하세요.' : '선택 가능한 제출 대상이 없습니다.');
      })
      .catch(err => {
        if (!alive) return;
        setCatalog([]);
        setCatalogStatus(`제출 대상 목록 오류: ${err instanceof Error ? err.message : String(err)}`);
      });
    return () => { alive = false; };
  }, [apiUrl, baseUrl]);

  const selectedTeacher = catalog.find(t => t.teacherId === destination.teacherId);
  const grades = gradesForTeacher(selectedTeacher);
  const classes = classesForTeacherGrade(selectedTeacher, destination.grade);
  const numbers = parseStudentNumbers(retryNumbers || destination.studentNumbers);
  const ready = !!(destination.portfolioBaseUrl && destination.teacherId && destination.grade && destination.classNo && numbers.length);

  const clearConfirmation = () => {
    requestTrackerRef.current.invalidate();
    setBusy(false);
    setConfirmed(false);
    setStatus('');
    setPreviewBlob(null);
    setPreviewUrl(current => updatePreviewObjectUrl({ currentUrl: current, blob: null, createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL }));
  };
  const changeDestination = (patch: Partial<Destination>, clearRetry = true) => {
    abortRef.current?.abort();
    setDestination(d => ({ ...d, ...patch }));
    if (clearRetry) setRetryNumbers('');
    clearConfirmation();
  };
  const setPreview = (blob: Blob | null) => {
    setPreviewBlob(blob);
    setPreviewUrl(current => updatePreviewObjectUrl({ currentUrl: current, blob, createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL }));
  };
  const submit = async () => {
    if (busy || !ready) return;
    if (!confirmed) {
      const revision = requestTrackerRef.current.snapshot();
      setBusy(true);
      setStatus('PNG 미리보기를 만드는 중입니다.');
      try {
        const blob = await makePngBlob();
        if (!requestTrackerRef.current.isCurrent(revision)) return;
        setPreview(blob);
        setConfirmed(true);
        setStatus('대상과 PNG 미리보기를 확인했습니다. 한 번 더 누르면 전송합니다.');
      } catch (err) {
        if (!requestTrackerRef.current.isCurrent(revision)) return;
        setPreview(null);
        setStatus(`PNG 미리보기 실패: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (requestTrackerRef.current.isCurrent(revision)) setBusy(false);
      }
      return;
    }
    const revision = requestTrackerRef.current.snapshot();
    setBusy(true);
    setStatus('제출 중입니다. 창을 닫지 마세요.');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await submitPortfolioGroup({
        destination: { ...destination, playerName },
        studentNumbers: numbers,
        pngBlob: previewBlob || await makePngBlob(),
        title,
        description,
        signal: controller.signal,
      });
      if (!requestTrackerRef.current.isCurrent(revision)) return;
      const retry = result.retryStudentNumbers.join(', ');
      setRetryNumbers(retry);
      setStatus(result.ok ? '등록이 완료되었습니다.' : `일부만 등록되었습니다. 다시 시도할 번호: ${retry}`);
      if (result.ok) setPreview(null);
      setConfirmed(false);
    } catch (err) {
      if (!requestTrackerRef.current.isCurrent(revision)) return;
      setStatus(err instanceof DOMException && err.name === 'AbortError' ? '제출을 취소했습니다.' : `제출 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (requestTrackerRef.current.isCurrent(revision)) setBusy(false);
    }
  };
  const cancel = () => {
    requestTrackerRef.current.invalidate();
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setConfirmed(false);
    setStatus('제출을 취소했습니다.');
  };

  return (
    <div data-no-capture="1" className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[14px] text-slate-800">
      <div className="grid grid-cols-4 gap-2">
        <label className="col-span-2">과목 / 교사
          <select className="mt-1 w-full rounded-lg border px-2 py-1" value={destination.teacherId} onChange={e => {
            const t = catalog.find(x => x.teacherId === e.target.value);
            changeDestination({ teacherId: t?.teacherId || '', subject: t?.subject || '', teacherName: t?.teacherName || '', grade: '', classNo: '' });
          }}>
            <option value="">선택</option>
            {catalog.map(t => <option key={t.teacherId} value={t.teacherId}>{teacherLabel({ ...t, grade: '', classNo: '' })}</option>)}
          </select>
        </label>
        <label>학년
          <select className="mt-1 w-full rounded-lg border px-2 py-1" disabled={!selectedTeacher} value={destination.grade} onChange={e => changeDestination({ grade: e.target.value, classNo: '' })}>
            <option value="">선택</option>
            {grades.map((g: string) => <option key={g} value={g}>{g}학년</option>)}
          </select>
        </label>
        <label>반
          <select className="mt-1 w-full rounded-lg border px-2 py-1" disabled={!destination.grade} value={destination.classNo} onChange={e => changeDestination({ classNo: e.target.value })}>
            <option value="">선택</option>
            {classes.map((c: ClassChoice) => <option key={c.classNo} value={c.classNo}>{c.displayName}</option>)}
          </select>
        </label>
        <label className="col-span-4">학생 번호
          <input
            ref={inputRef}
            className="mt-1 w-full rounded-lg border px-2 py-1"
            value={retryNumbers || destination.studentNumbers}
            placeholder="7 또는 7, 8"
            onChange={e => {
              const start = e.currentTarget.selectionStart;
              const end = e.currentTarget.selectionEnd;
              changeDestination({ studentNumbers: e.currentTarget.value }, false);
              setRetryNumbers('');
              requestAnimationFrame(() => {
                inputRef.current?.focus();
                if (start !== null && end !== null) inputRef.current?.setSelectionRange(start, end);
              });
            }}
          />
        </label>
      </div>
      {previewUrl ? (
        <figure className="mt-3 flex items-center gap-3">
          <img src={previewUrl} alt={`${title} PNG 미리보기`} className="h-[90px] w-[144px] rounded-lg border object-contain bg-white" />
          <figcaption>PNG 미리보기 · {summary}</figcaption>
        </figure>
      ) : <p className="mt-2 text-slate-600">PNG 미리보기는 대상 확인 후 표시됩니다. · {summary}</p>}
      <p className="mt-1 text-slate-600">{destination.teacherId ? teacherLabel(destination) : '과목 / 교사를 선택하세요.'} · {destination.grade || '학년'}-{destination.classNo || '반'} · {retryNumbers || destination.studentNumbers || '번호 미입력'}</p>
      <p className="mt-1 min-h-[20px]" role="status">{status || catalogStatus}</p>
      <div className="mt-2 flex gap-2 justify-end">
        <button type="button" onClick={submit} disabled={busy || !ready} className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-50">{confirmed ? '확인 후 전송' : '대상 확인'}</button>
        {busy && <button type="button" onClick={cancel} className="rounded-xl border border-slate-300 px-4 py-2 font-bold">취소</button>}
      </div>
    </div>
  );
}
