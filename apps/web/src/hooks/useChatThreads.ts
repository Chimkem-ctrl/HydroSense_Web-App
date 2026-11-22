import { useQuery } from '@tanstack/react-query';
import { DATA_MODE } from '../app/config';
import { useAuth } from '../app/auth/RoleContext';
import { chatService } from '../services/chatService';

export function useChatThreads() {
  const user = useAuth();
  return useQuery({
    queryKey: ['chat-threads', user?.id],
    queryFn: chatService.threads,
    enabled: DATA_MODE === 'api' && Boolean(user),
    refetchInterval: 10_000,
  });
}
