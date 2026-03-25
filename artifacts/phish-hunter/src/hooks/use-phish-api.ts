import { useQueryClient } from "@tanstack/react-query";
import { 
  useAnalyzeMessages as useGeneratedAnalyze,
  useDeleteMessage as useGeneratedDelete,
  useGetMessages,
  useGetMessageStats,
  getGetMessagesQueryKey,
  getGetMessageStatsQueryKey
} from "@workspace/api-client-react";

export function usePhishApi() {
  const queryClient = useQueryClient();

  const analyzeMutation = useGeneratedAnalyze({
    mutation: {
      onSuccess: () => {
        // Invalidate lists and stats after a successful analysis
        queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMessageStatsQueryKey() });
      }
    }
  });

  const deleteMutation = useGeneratedDelete({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMessageStatsQueryKey() });
      }
    }
  });

  return {
    analyze: analyzeMutation,
    remove: deleteMutation,
    useMessages: useGetMessages,
    useStats: useGetMessageStats
  };
}
