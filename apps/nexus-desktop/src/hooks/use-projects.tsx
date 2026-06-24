import { useState, useEffect, useCallback } from 'react';
import { invoke, isTauri, type Project } from '../lib/tauri';

export interface UseProjectsReturn {
  projects: Project[];
  activeProject: Project | null;
  loading: boolean;
  addProject: (path: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  selectProject: (id: string) => void;
}

export function useProjects(): UseProjectsReturn {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);

  const sync = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const list = await invoke<Project[]>('list_projects');
      setProjects(list);
    } catch {}
  }, []);

  useEffect(() => {
    sync();
  }, [sync]);

  const addProject = useCallback(async (path: string) => {
    if (!isTauri()) return;
    setLoading(true);
    try {
      const project = await invoke<Project>('add_project', { path });
      setProjects(prev => [...prev, project]);
      setActiveProject(project);
    } finally {
      setLoading(false);
    }
  }, []);

  const removeProject = useCallback(async (id: string) => {
    if (!isTauri()) return;
    try {
      await invoke('remove_project', { id });
      setProjects(prev => prev.filter(p => p.id !== id));
      if (activeProject?.id === id) {
        setActiveProject(null);
      }
    } catch (e) {
      console.error('Failed to remove project:', e);
    }
  }, [activeProject]);

  const selectProject = useCallback((id: string) => {
    const p = projects.find(p => p.id === id) || null;
    setActiveProject(p);
  }, [projects]);

  return { projects, activeProject, loading, addProject, removeProject, selectProject };
}
