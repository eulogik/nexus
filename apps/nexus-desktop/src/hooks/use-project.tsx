import { useState, useCallback, useEffect } from 'react';
import { isTauri, listProjectFiles as tauriListProjectFiles, readProjectFile as tauriReadProjectFile } from '../lib/tauri';

export interface ProjectFile {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  children?: ProjectFile[];
}

interface UseProjectReturn {
  files: ProjectFile[];
  currentDir: string;
  selectedFile: ProjectFile | null;
  fileContent: string | null;
  loading: boolean;
  navigateToDir: (dir: string) => void;
  selectFile: (file: ProjectFile) => void;
  goBack: () => void;
}

export function useProject(): UseProjectReturn {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [currentDir, setCurrentDir] = useState('');
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadDir = useCallback(async (dir: string) => {
    if (!isTauri()) return;
    setLoading(true);
    try {
      const entries = await tauriListProjectFiles(dir);
      setFiles(entries.map(e => ({
        name: e.name,
        path: e.path,
        is_dir: e.is_dir,
        size: e.size,
        children: [],
      })));
    } catch {
      setFiles([]);
    }
    setLoading(false);
  }, []);

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
    } else {
      try {
        const content = await tauriReadProjectFile(file.path);
        setFileContent(content);
      } catch {
        setFileContent('// Error reading file');
      }
    }
  }, [navigateToDir]);

  const goBack = useCallback(() => {
    if (!currentDir) return;
    const parent = currentDir.split('/').slice(0, -1).join('/');
    navigateToDir(parent || '');
  }, [currentDir, navigateToDir]);

  return {
    files,
    currentDir,
    selectedFile,
    fileContent,
    loading,
    navigateToDir,
    selectFile,
    goBack,
  };
}
