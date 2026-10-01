import ParentDetails from "./parentDetails";

export default interface BranchDetails {
    parentDetails: ParentDetails | null;
    branchName: string;
    branchPrefix: string;
    workItemType: string;
    hasParent: boolean;
    originalParentDetails: ParentDetails | null;
}

export interface ExistingBranches {
    // Name of the existing parent branch, undefined when it still has to be created
    parentBranchName?: string;
    // Name of the existing work item branch, undefined when it still has to be created
    branchName?: string;
    // Branches sharing a work item ID prefix with another branch
    duplicateBranchNames: string[];
}
