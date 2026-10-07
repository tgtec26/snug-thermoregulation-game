export type PortfolioClassChoice = {
  portfolioBaseUrl: string;
  teacherId: string;
  subject: string;
  teacherName: string;
  grade: string;
  classNo: string;
  displayName: string;
};

export type PortfolioTeacherChoice = {
  teacherId: string;
  subject: string;
  teacherName: string;
  classes: PortfolioClassChoice[];
};

export function teacherLabel(destination: { subject: string; teacherName: string; teacherId: string; grade?: string; classNo?: string }): string;
export function normalizeDestinationCatalog(raw: unknown, portfolioBaseUrl: string): PortfolioTeacherChoice[];
export function gradesForTeacher(teacher: PortfolioTeacherChoice | null | undefined): string[];
export function classesForTeacherGrade(teacher: PortfolioTeacherChoice | null | undefined, grade: string): PortfolioClassChoice[];
export function updatePreviewObjectUrl(params: {
  currentUrl: string;
  blob: Blob | null;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
}): string;
export function createPortfolioRequestTracker(): {
  snapshot(): number;
  invalidate(): void;
  unmount(): void;
  isCurrent(snapshot: number): boolean;
};
export function parseStudentNumbers(raw: string): number[];
export function remainingStudentNumbers(numbers: number[], succeeded: number[]): number[];
export function submitPortfolioGroup(params: {
  destination: {
    portfolioBaseUrl: string;
    teacherId: string;
    subject: string;
    teacherName: string;
    grade: string;
    classNo: string;
    playerName?: string;
  };
  studentNumbers: number[];
  pngBlob: Blob;
  title: string;
  description: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  onSuccess?: (studentNumber: number) => void;
}): Promise<{ ok: boolean; retryStudentNumbers: number[] }>;
