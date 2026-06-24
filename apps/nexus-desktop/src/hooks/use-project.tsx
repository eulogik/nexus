import { useState, useCallback, useEffect } from 'react';
import { invoke, isTauri, type FileEntry } from '../lib/tauri';

export interface ProjectFile {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

interface UseProjectReturn {
  files: ProjectFile[];
  currentDir: string;
  selectedFile: ProjectFile | null;
  fileContent: string | null;
  loading: boolean;
  filesError: string | null;
  navigateToDir: (dir: string) => void;
  selectFile: (file: ProjectFile) => void;
  goBack: () => void;
  refresh: () => void;
}

export function useProject(projectId: string | null): UseProjectReturn {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [currentDir, setCurrentDir] = useState('');
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  const loadDir = useCallback(async (dir: string) => {
    if (!isTauri() || !projectId) {
      setFiles([]);
      return;
    }
    setLoading(true);
    setFilesError(null);
    try {
      const entries = await invoke<FileEntry[]>('list_project_files', { projectId, dir });
      setFiles(entries.map(e => ({
        name: e.name,
        path: e.path,
        is_dir: e.is_dir,
        size: e.size,
      })));
    } catch (e) {
      setFiles([]);
      setFilesError(String(e));
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadDir('');
  }, [loadDir]);

  const navigateToDir = useCallback((dir: string) => {
    setCurrentDir(dir);
    setSelectedFile(null);
    setFileContent(null);
    loadDir(dir);
  }, [loadDir]);

  const selectFile = useCallback(async (file: ProjectFile) => {
    setSelectedFile(file);
    if (file.is_dir) {
      navigateToDir(file.path);
    } else if (isTauri() && projectId) {
      try {
        const content = await invoke<string>('read_project_file', { projectId, filePath: file.path });
        setFileContent(content);
      } catch {
        setFileContent('// Error reading file');
      }
    }
  }, [navigateToDir, projectId]);

  const goBack = useCallback(() => {
    if (!currentDir || !projectId) return;
    const parent = currentDir.split('/').slice(0, -1).join('/');
    const projectRoot = '';  // the project root relative to itself
    // If parent is above project root, go to root
    navigateToDir(parent || '');
  }, [currentDir, navigateToDir, projectId]);

  const refresh = useCallback(() => {
    loadDir(currentDir);
  }, [loadDir, currentDir]);

  return {
    files,
    currentDir,
    selectedFile,
    fileContent,
    loading,
    filesError,
    navigateToDir,
    selectFile,
    goBack,
    refresh,
  };
}
