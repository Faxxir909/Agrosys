import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { socket } from '../lib/socket';

export interface Task {
  id: string;
  taskTitle: string;
  clientId: string;
  clientName: string;
  dueDate: string;
  cropType: string;
  category: string;
  status: string;
  ownerId: string;
  createdAt: Date;
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    let active = true;

    const fetchTasks = async () => {
      try {
        const data = await api.tasks.list();
        if (active) {
          setTasks(data);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching tasks:', err);
      }
    };

    fetchTasks();
    socket.on('tasks', fetchTasks);

    const interval = setInterval(() => {
      if (!socket.connected) {
        fetchTasks();
      }
    }, 20000);

    return () => {
      active = false;
      socket.off('tasks', fetchTasks);
      clearInterval(interval);
    };
  }, [user]);

  return { tasks, loading, setTasks };
}
