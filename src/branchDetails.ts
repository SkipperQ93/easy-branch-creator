import ParentDetails from "./parentDetails";

export default interface BranchDetails {
    parentDetails: ParentDetails;
    branchName: string;
    workItemType: string;
}
