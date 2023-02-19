
import { useQuery } from '@tanstack/react-query';
import { SoundInfo } from '../model/model';

export function useFiles() {
    const { data: files } = useQuery(['files'], () => fetch("/api/files").then(r => r.json() as Promise<SoundInfo[]>))

    return files;
}

export default useFiles;
