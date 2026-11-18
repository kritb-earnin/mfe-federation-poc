
    export type RemoteKeys = 'vueRemote/mount';
    type PackageType<T> = T extends 'vueRemote/mount' ? typeof import('vueRemote/mount') :any;