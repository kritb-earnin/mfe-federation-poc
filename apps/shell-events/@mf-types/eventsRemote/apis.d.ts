
    export type RemoteKeys = 'eventsRemote/mount';
    type PackageType<T> = T extends 'eventsRemote/mount' ? typeof import('eventsRemote/mount') :any;