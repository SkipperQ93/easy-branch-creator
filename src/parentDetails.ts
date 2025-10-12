export default interface ParentDetails {
    id: number;
    type: string;
    title: string;
    branchName: string;
    grandParent: ParentDetails | null
}
