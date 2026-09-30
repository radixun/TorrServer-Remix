import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import axios from 'axios'
import { viewedHost } from 'utils/Hosts'

const queryKey = hash => ['cinema-viewed', hash]

export default function useViewed(hash) {
  const client = useQueryClient()
  const pending = useRef(null)
  const query = useQuery(
    queryKey(hash),
    async ({ signal }) => {
      const { data } = await axios.post(viewedHost(), { action: 'list', hash }, { signal, timeout: 8000 })
      if (data !== null && !Array.isArray(data)) throw new Error('Invalid viewed history')
      return (data || []).filter(item => item.hash === hash).map(item => Number(item.file_index))
    },
    { retry: 1, refetchInterval: 10000, refetchIntervalInBackground: false },
  )
  const mutation = useMutation(
    async variables => {
      await client.cancelQueries(queryKey(variables.hash))
      await axios.post(viewedHost(), variables, { timeout: 8000 })
    },
    {
      onSuccess: (_, variables) => {
        client.setQueryData(queryKey(variables.hash), (current = []) => {
          const rest = current.filter(id => id !== variables.file_index)
          return variables.action === 'set' ? [...rest, variables.file_index] : rest
        })
        client.invalidateQueries(queryKey(variables.hash))
      },
    },
  )
  const action = async (command, id) => {
    if (pending.current) {
      try {
        await pending.current
      } catch (_) {
        // A failed previous write must not discard this file's mark.
      }
      return action(command, id)
    }
    pending.current = mutation.mutateAsync({ action: command, hash, file_index: id })
    try {
      await pending.current
    } catch (_) {
      // Preserve the last confirmed history; the page offers a retry.
    } finally {
      pending.current = null
    }
  }
  return {
    ...query,
    action,
    pending: mutation.isLoading,
    actionError: mutation.isError && mutation.variables?.hash === hash,
    retry: () =>
      mutation.isError && mutation.variables?.hash === hash
        ? action(mutation.variables.action, mutation.variables.file_index)
        : query.refetch(),
    mark: id => action('set', id),
    has: id => query.data?.includes(id) || false,
  }
}
