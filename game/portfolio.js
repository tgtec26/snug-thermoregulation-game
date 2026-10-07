export function classIdFromDestination(/** @type {{grade:string,classNo:string}} */ destination) {
  return `${destination.grade.trim()}-${destination.classNo.trim()}`;
}

export function teacherLabel(/** @type {{subject:string,teacherName:string,teacherId:string}} */ destination) {
  const subject = destination.subject.trim() || '과목';
  const teacher = destination.teacherName.trim() || '담당 교사';
  return `${subject} / ${teacher} (${destination.teacherId})`;
}

/**
 * @typedef {{classId:string,grade:string,classNo:string,displayName:string,portfolioBaseUrl:string,teacherId:string,subject:string,teacherName:string}} PortfolioClassChoice
 * @typedef {{teacherId:string,subject:string,teacherName:string,classes:PortfolioClassChoice[]}} PortfolioTeacherChoice
 */

export function normalizeDestinations(/** @type {any[]} */ raw) {
  return raw
    .filter((d) => d && d.portfolioBaseUrl && d.teacherId && d.grade && d.classNo)
    .map((d) => ({
      portfolioBaseUrl: String(d.portfolioBaseUrl),
      teacherId: String(d.teacherId),
      subject: String(d.subject || ''),
      teacherName: String(d.teacherName || ''),
      grade: String(d.grade),
      classNo: String(d.classNo),
    }));
}

export function normalizeDestinationCatalog(/** @type {any} */ raw, /** @type {string} */ portfolioBaseUrl) {
  return (raw?.teachers || [])
    .filter((/** @type {any} */ teacher) => teacher?.teacherId && teacher?.subject && teacher?.teacherName)
    .map((/** @type {any} */ teacher) => ({
      teacherId: String(teacher.teacherId),
      subject: String(teacher.subject),
      teacherName: String(teacher.teacherName),
      classes: (teacher.classes || [])
        .filter((/** @type {any} */ classSummary) => classSummary?.grade && classSummary?.classNo && classSummary?.classId)
        .map((/** @type {any} */ classSummary) => ({
          portfolioBaseUrl,
          teacherId: String(teacher.teacherId),
          subject: String(teacher.subject),
          teacherName: String(teacher.teacherName),
          classId: String(classSummary.classId),
          grade: String(classSummary.grade),
          classNo: String(classSummary.classNo),
          displayName: String(classSummary.displayName || `${classSummary.grade}-${classSummary.classNo}`),
        })),
    }))
    .filter((/** @type {PortfolioTeacherChoice} */ teacher) => teacher.classes.length > 0);
}

export function gradesForTeacher(/** @type {PortfolioTeacherChoice|null|undefined} */ teacher) {
  return [...new Set((teacher?.classes || []).map((/** @type {PortfolioClassChoice} */ classSummary) => classSummary.grade))];
}

export function classesForTeacherGrade(/** @type {PortfolioTeacherChoice|null|undefined} */ teacher, /** @type {string} */ grade) {
  return (teacher?.classes || []).filter((/** @type {PortfolioClassChoice} */ classSummary) => classSummary.grade === grade);
}

export function updatePreviewObjectUrl(/** @type {{currentUrl:string,blob:Blob|null,createObjectURL:(blob:Blob)=>string,revokeObjectURL:(url:string)=>void}} */ params) {
  if (params.currentUrl) params.revokeObjectURL(params.currentUrl);
  return params.blob ? params.createObjectURL(params.blob) : '';
}

export function createPortfolioRequestTracker() {
  let revision = 0;
  let mounted = true;
  return {
    snapshot() {
      return revision;
    },
    invalidate() {
      revision += 1;
    },
    unmount() {
      mounted = false;
    },
    isCurrent(/** @type {number} */ snapshot) {
      return mounted && revision === snapshot;
    },
  };
}

export function bindPortfolioTextInput(
  /** @type {EventTarget & {value:string,dataset:{pf?:string}}} */ input,
  /** @type {{update:(patch:Record<string,string>)=>void,resetRetry:()=>void,resetConfirmation:()=>void,render:()=>void}} */ handlers,
) {
  input.addEventListener('input', () => {
    const key = input.dataset.pf;
    if (!key) return;
    handlers.update({ [key]: input.value });
    if (key === 'studentNumbers') handlers.resetRetry();
    handlers.resetConfirmation();
    handlers.render();
  });
}

export function destinationKey(/** @type {{teacherId:string,grade:string,classNo:string}} */ destination) {
  return `${destination.teacherId}::${destination.grade}::${destination.classNo}`;
}

export function applyDestinationChoice(/** @type {any} */ current, /** @type {any[]} */ destinations, /** @type {string} */ key) {
  const selected = destinations.find((d) => destinationKey(d) === key);
  return selected ? { ...current, ...selected } : current;
}

export function parseStudentNumbers(/** @type {string} */ raw) {
  const seen = new Set();
  return raw
    .split(/[,\s]+/)
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
    .filter((n) => {
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    });
}

export function remainingStudentNumbers(/** @type {number[]} */ numbers, /** @type {number[]} */ succeeded) {
  const done = new Set(succeeded);
  return numbers.filter(number => !done.has(number));
}

export function pngFileName(/** @type {string} */ playerName, /** @type {Date} */ now = new Date()) {
  const safe = (playerName || 'student').replace(/[\\/:*?"<>|]/g, '').trim() || 'student';
  return `오차-구조대-${safe}-${now.toISOString().slice(0, 10)}.png`;
}

export function defaultIdempotencyKey(/** @type {{teacherId:string,grade:string,classNo:string}} */ destination, /** @type {number} */ studentNumber, /** @type {Date} */ now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return `measurement-${destination.teacherId}-${destination.grade}-${destination.classNo}-${studentNumber}-${day}`;
}

async function parseDriveUploadResponse(/** @type {Response} */ response) {
  const text = await response.text();
  if (!response.ok) throw new Error(`Drive upload failed (${response.status})`);
  try {
    const json = JSON.parse(text);
    if (json?.id) return String(json.id);
  } catch {}
  throw new Error('Drive upload response missing file id');
}

/**
 * @param {{
 *  destination:{portfolioBaseUrl:string,teacherId:string,subject:string,teacherName:string,grade:string,classNo:string,playerName?:string},
 *  studentNumber:number,
 *  pngBlob:Blob,
 *  title:string,
 *  description:string,
 *  fetchImpl?:typeof fetch,
 *  signal?:AbortSignal,
 *  idempotencyKey?:string
 * }} params
 */
export async function submitPortfolioImage(params) {
  const {
    destination,
    studentNumber,
    pngBlob,
    title,
    description,
    fetchImpl = fetch,
    signal,
    idempotencyKey = defaultIdempotencyKey(destination, studentNumber),
  } = params;
  const base = destination.portfolioBaseUrl.replace(/\/$/, '');
  const classId = classIdFromDestination(destination);
  const fileName = pngFileName(destination.playerName || title || 'student');
  const file = { name: fileName, mimeType: 'image/png', size: pngBlob.size };
  const sessionRes = await fetchImpl(`${base}/api/t/${encodeURIComponent(destination.teacherId)}/upload-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      classId,
      studentNumber,
      idempotencyKey,
      files: [file],
      title,
    }),
  });
  const session = await sessionRes.json().catch(() => ({}));
  if (!sessionRes.ok) throw new Error(session.error || `Upload session failed (${sessionRes.status})`);
  if (session.existing) return { ok: true, existing: true, post: session.existing };
  if (!session.uploadUrls?.[0]) throw new Error('Upload session response missing upload URL');

  const uploadRes = await fetchImpl(session.uploadUrls[0], {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png', 'Content-Length': String(pngBlob.size) },
    body: pngBlob,
    signal,
  });
  const fileId = await parseDriveUploadResponse(uploadRes);

  const finalizeRes = await fetchImpl(`${base}/api/t/${encodeURIComponent(destination.teacherId)}/upload-finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      classId,
      studentNumber,
      idempotencyKey,
      type: 'image',
      driveFileIds: [fileId],
      mimeTypes: ['image/png'],
      uploadToken: session.uploadToken,
      uploadedFiles: [{ ...file, fileId }],
      title,
      description,
    }),
  });
  const post = await finalizeRes.json().catch(() => ({}));
  if (!finalizeRes.ok) throw new Error(post.error || `Finalize failed (${finalizeRes.status})`);
  return { ok: true, existing: false, post };
}

/**
 * @param {{
 *  destination:{portfolioBaseUrl:string,teacherId:string,subject:string,teacherName:string,grade:string,classNo:string,playerName?:string},
 *  studentNumbers:number[],
 *  pngBlob:Blob,
 *  title:string,
 *  description:string,
 *  fetchImpl?:typeof fetch,
 *  signal?:AbortSignal,
 *  onSuccess?:(studentNumber:number)=>void
 * }} params
 */
export async function submitPortfolioGroup(params) {
  const results = [];
  for (const studentNumber of params.studentNumbers) {
    try {
      const result = await submitPortfolioImage({ ...params, studentNumber });
      results.push({ studentNumber, ok: true, result });
      params.onSuccess?.(studentNumber);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      results.push({ studentNumber, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return {
    ok: results.every((r) => r.ok),
    results,
    retryStudentNumbers: results.filter((r) => !r.ok).map((r) => r.studentNumber),
  };
}
