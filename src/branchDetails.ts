import ParentDetails from "./parentDetails";

export default interface BranchDetails {
    parentDetails: ParentDetails | null;
    branchName: string;
    workItemType: string;
    hasParent: boolean;
}
