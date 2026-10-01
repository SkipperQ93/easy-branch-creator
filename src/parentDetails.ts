export default interface ParentDetails {
    id: number;
    type: string;
    title: string;
    branchName: string;
    branchPrefix: string;
    grandParent: ParentDetails | null
}
