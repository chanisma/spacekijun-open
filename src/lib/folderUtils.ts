import { Document } from '@/features/documents/types';

/**
 * 가상 폴더 구조를 나타내는 인터페이스
 */
export interface VirtualFolder {
  name: string;           // 폴더 이름
  path: string;           // 전체 경로 (예: "2025/서류함/교무운영부")
  children: VirtualFolder[]; // 하위 폴더
  fileCount: number;      // 이 폴더의 직접 파일 개수
  totalFileCount: number; // 이 폴더 및 하위 폴더의 전체 파일 개수
  depth: number;          // 깊이 (0부터 시작)
  isExpanded?: boolean;   // 확장 상태 (UI용)
}

/**
 * 문서 배열에서 가상 폴더 트리 구조를 생성합니다.
 * directory_path 메타데이터를 파싱하여 계층 구조를 만들고,
 * `extraPaths`(document_folders registry — 빈 폴더 포함)를 트리에 합칩니다.
 */
export function buildFolderTree(documents: Document[], extraPaths: string[] = []): VirtualFolder {
  const root: VirtualFolder = {
    name: 'Root',
    path: '',
    children: [],
    fileCount: 0,
    totalFileCount: 0,
    depth: 0,
    isExpanded: true,
  };

  // 모든 문서의 directory_path를 수집
  const folderPaths = new Set<string>();
  const fileCountByPath = new Map<string, number>();

  documents.forEach(doc => {
    const directoryPath = doc.meta?.directory_path;
    if (!directoryPath) {
      // directory_path가 없는 파일은 루트에 위치
      root.fileCount++;
      root.totalFileCount++;
      return;
    }

    // 경로의 모든 부모 경로를 추가
    const pathParts = directoryPath.split('/').filter(p => p.trim());
    let currentPath = '';

    pathParts.forEach(part => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      folderPaths.add(currentPath);
    });

    // 파일 개수 카운트
    fileCountByPath.set(directoryPath, (fileCountByPath.get(directoryPath) || 0) + 1);
  });

  // registry 경로(빈 폴더 포함) 합류 — 부모 경로까지 전부 추가
  extraPaths.forEach(extraPath => {
    const pathParts = extraPath.split('/').filter(p => p.trim());
    let currentPath = '';
    pathParts.forEach(part => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      folderPaths.add(currentPath);
    });
  });

  // 정렬된 경로 배열 생성
  const sortedPaths = Array.from(folderPaths).sort();

  // 폴더 맵 생성 (빠른 조회를 위해)
  const folderMap = new Map<string, VirtualFolder>();
  folderMap.set('', root);

  // 폴더 트리 구축
  sortedPaths.forEach(path => {
    const pathParts = path.split('/');
    const folderName = pathParts[pathParts.length - 1];
    const parentPath = pathParts.slice(0, -1).join('/');
    const parent = folderMap.get(parentPath);

    if (parent) {
      const folder: VirtualFolder = {
        name: folderName,
        path: path,
        children: [],
        fileCount: fileCountByPath.get(path) || 0,
        totalFileCount: 0, // 나중에 계산
        depth: pathParts.length,
        isExpanded: false, // 기본적으로 접힌 상태
      };

      parent.children.push(folder);
      folderMap.set(path, folder);
    }
  });

  // 총 파일 개수 계산 (하위 폴더 포함)
  function calculateTotalFileCount(folder: VirtualFolder): number {
    let total = folder.fileCount;
    folder.children.forEach(child => {
      total += calculateTotalFileCount(child);
    });
    folder.totalFileCount = total;
    return total;
  }

  calculateTotalFileCount(root);

  return root;
}

/**
 * 폴더 트리를 평탄화하여 렌더링하기 쉬운 배열로 변환합니다.
 */
export function flattenFolderTree(folder: VirtualFolder, includeCollapsed: boolean = false): VirtualFolder[] {
  const result: VirtualFolder[] = [];

  function traverse(currentFolder: VirtualFolder) {
    if (currentFolder.path !== '') { // 루트 제외
      result.push(currentFolder);
    }

    if (currentFolder.isExpanded || includeCollapsed) {
      currentFolder.children.forEach(child => traverse(child));
    }
  }

  traverse(folder);
  return result;
}

/**
 * 경로로 폴더를 찾습니다.
 */
export function findFolderByPath(root: VirtualFolder, path: string): VirtualFolder | null {
  if (root.path === path) return root;

  for (const child of root.children) {
    const found = findFolderByPath(child, path);
    if (found) return found;
  }

  return null;
}

/**
 * 폴더의 확장 상태를 토글합니다.
 */
export function toggleFolderExpansion(root: VirtualFolder, path: string): VirtualFolder {
  const cloned = cloneFolderTree(root);
  const folder = findFolderByPath(cloned, path);
  if (folder) {
    folder.isExpanded = !folder.isExpanded;
  }
  return cloned;
}

/**
 * 폴더 트리를 깊은 복사합니다.
 */
function cloneFolderTree(folder: VirtualFolder): VirtualFolder {
  return {
    ...folder,
    children: folder.children.map(child => cloneFolderTree(child)),
  };
}

/**
 * 특정 경로의 모든 상위 폴더를 확장합니다.
 */
export function expandPathToFolder(root: VirtualFolder, targetPath: string): VirtualFolder {
  const cloned = cloneFolderTree(root);
  const pathParts = targetPath.split('/').filter(p => p.trim());

  let currentPath = '';
  pathParts.forEach(part => {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    const folder = findFolderByPath(cloned, currentPath);
    if (folder) {
      folder.isExpanded = true;
    }
  });

  return cloned;
}

/**
 * 폴더 경로의 깊이를 계산합니다.
 */
export function getFolderDepth(path: string): number {
  if (!path) return 0;
  return path.split('/').filter(p => p.trim()).length;
}

/**
 * 상위 폴더 경로를 반환합니다.
 */
export function getParentPath(path: string): string {
  const parts = path.split('/').filter(p => p.trim());
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('/');
}

/**
 * 경로가 다른 경로의 하위인지 확인합니다.
 */
export function isSubPath(childPath: string, parentPath: string): boolean {
  if (!parentPath) return true; // 루트는 모든 경로의 상위
  return childPath.startsWith(parentPath + '/') || childPath === parentPath;
}
