/**
 * IndexedDB 서비스 - 학생 데이터 영구 저장
 * 브라우저 IndexedDB를 사용하여 학생 데이터를 저장하고 관리합니다.
 */

import { Student } from '../types';

const DB_NAME = 'EvalogDB';
const DB_VERSION = 2;
const STORE_NAME = 'students';

/**
 * IndexedDB 데이터베이스 열기
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // IndexedDB 지원 여부 확인
    if (!window.indexedDB) {
      console.warn('⚠ IndexedDB가 지원되지 않는 브라우저입니다.');
      reject(new Error('IndexedDB를 지원하지 않는 브라우저입니다.'));
      return;
    }

    let request: IDBOpenDBRequest;

    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      console.error('❌ IndexedDB 접근 실패:', error);
      reject(new Error('IndexedDB에 접근할 수 없습니다. 브라우저 설정을 확인하세요.'));
      return;
    }

    request.onerror = (event) => {
      const error = (event.target as IDBOpenDBRequest).error;
      console.error('❌ IndexedDB 열기 실패:', error);
      reject(new Error(`IndexedDB를 열 수 없습니다: ${error?.message || '알 수 없는 오류'}`));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // students 스토어 생성 (기존 스토어 삭제 후 재생성 - 데이터 초기화됨에 주의)
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }

      const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'studentNo' });

      // 인덱스 생성
      objectStore.createIndex('name', 'name', { unique: false });
      objectStore.createIndex('schoolName', 'schoolName', { unique: false });
      objectStore.createIndex('department', 'department', { unique: false });
      objectStore.createIndex('ipsiType', 'ipsiType', { unique: false });
      objectStore.createIndex('uploadedAt', 'uploadedAt', { unique: false });
      objectStore.createIndex('uploadedAt', 'uploadedAt', { unique: false });
    };
  });
}

/**
 * 학생 데이터 저장
 */
export async function saveStudent(student: Partial<Student>): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);

    // 업로드 시간 추가
    const studentWithMetadata = {
      ...student,
      uploadedAt: new Date().toISOString(),
      lastModified: new Date().toISOString()
    };

    const request = objectStore.put(studentWithMetadata);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('학생 데이터 저장에 실패했습니다.'));
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * 학생 데이터 조회 (수험번호로)
 */
export async function getStudent(studentNo: string): Promise<Partial<Student> | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.get(studentNo);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(new Error('학생 데이터 조회에 실패했습니다.'));
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * 모든 학생 데이터 조회
 */
export async function getAllStudents(): Promise<Partial<Student>[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.getAll();

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(new Error('학생 데이터 목록 조회에 실패했습니다.'));
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * 학생 데이터 삭제
 */
export async function deleteStudent(studentNo: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.delete(studentNo);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('학생 데이터 삭제에 실패했습니다.'));
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * 여러 학생 데이터 일괄 저장
 */
export async function saveStudentsBatch(students: Partial<Student>[]): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);

    let errorOccurred = false;

    students.forEach((student) => {
      const studentWithMetadata = {
        ...student,
        uploadedAt: student.uploadedAt || new Date().toISOString(),
        lastModified: new Date().toISOString()
      };

      const request = objectStore.put(studentWithMetadata);

      request.onerror = () => {
        errorOccurred = true;
      };
    });

    transaction.oncomplete = () => {
      db.close();
      if (errorOccurred) {
        reject(new Error('일부 학생 데이터 저장에 실패했습니다.'));
      } else {
        resolve();
      }
    };

    transaction.onerror = () => {
      reject(new Error('학생 데이터 일괄 저장에 실패했습니다.'));
    };
  });
}

/**
 * 모든 학생 데이터 삭제
 */
export async function clearAllStudents(): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.clear();

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('학생 데이터 전체 삭제에 실패했습니다.'));
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * 인덱스를 사용한 검색
 */
export async function searchStudents(
  indexName: 'name' | 'schoolName' | 'department' | 'ipsiType',
  value: string
): Promise<Partial<Student>[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const index = objectStore.index(indexName);
    const request = index.getAll(value);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(new Error('학생 데이터 검색에 실패했습니다.'));
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * 학생 데이터 존재 여부 확인
 */
export async function studentExists(studentNo: string): Promise<boolean> {
  const student = await getStudent(studentNo);
  return student !== null;
}

/**
 * 학생 데이터 업데이트 (부분 업데이트)
 */
export async function updateStudent(
  studentNo: string,
  updates: Partial<Student>
): Promise<void> {
  const existingStudent = await getStudent(studentNo);

  if (!existingStudent) {
    throw new Error('해당 수험번호의 학생 데이터를 찾을 수 없습니다.');
  }

  const updatedStudent = {
    ...existingStudent,
    ...updates,
    studentNo, // 학번은 변경 불가
    lastModified: new Date().toISOString()
  };

  await saveStudent(updatedStudent);
}
