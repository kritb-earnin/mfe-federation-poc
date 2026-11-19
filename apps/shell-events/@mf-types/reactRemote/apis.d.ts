
    export type RemoteKeys = 'reactRemote/mount';
    type PackageType<T> = T extends 'reactRemote/mount' ? typeof import('reactRemote/mount') :any;