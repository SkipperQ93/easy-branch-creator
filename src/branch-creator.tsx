import * as SDK from "azure-devops-extension-sdk";
import {
    CommonServiceIds,
    getClient,
    IGlobalMessagesService,
    IHostNavigationService,
    IProjectInfo
} from "azure-devops-extension-api";
import {
    WorkItemExpand,
    WorkItemRelation,
    WorkItemTrackingRestClient
} from "azure-devops-extension-api/WorkItemTracking";
import {GitBranchStats, GitRestClient} from "azure-devops-extension-api/Git";
import {StorageService} from "./storage-service";
import {JsonPatchOperation, Operation} from "azure-devops-extension-api/WebApi";
import SettingsDocument from "./settingsDocument";
import ParentDetails from "./parentDetails";
import BranchDetails, {ExistingBranches} from "./branchDetails";

export class BranchCreator {

    public async createBranch(workItemId: number, repositoryId: string, project: IProjectInfo, gitBaseUrl: string): Promise<void> {
        const navigationService = await SDK.getService<IHostNavigationService>(CommonServiceIds.HostNavigationService);
        const globalMessagesSvc = await SDK.getService<IGlobalMessagesService>(CommonServiceIds.GlobalMessagesService);
        const gitRestClient = getClient(GitRestClient);
        const workItemTrackingRestClient = getClient(WorkItemTrackingRestClient);
        const storageService = new StorageService();
        const settingsDocument = await storageService.getSettings();

        const repository = await gitRestClient.getRepository(repositoryId, project.name);

        const branchDetails = await this.getBranchDetails(workItemTrackingRestClient, settingsDocument, workItemId, project.name);
        const parentDetails = branchDetails.parentDetails;

        const existingBranches = await this.getExistingBranches(gitRestClient, repositoryId, project.name, branchDetails);
        if (existingBranches.duplicateBranchNames.length > 0) {
            console.warn(`Duplicate branches found for work item ${workItemId}`, existingBranches.duplicateBranchNames);

            globalMessagesSvc.addDialog({
                message: `Multiple branches exist for the same work item: ${existingBranches.duplicateBranchNames.join(", ")}. Kindly delete the extra branches and try again.`
            });

            return;
        }

        const branchName = existingBranches.branchName ?? branchDetails.branchName;
        const parentBranchName = existingBranches.parentBranchName ?? parentDetails?.branchName;
        const branchUrl = `${gitBaseUrl}/${repository.name}?version=GB${encodeURI(branchName)}`;

        let parentMessage = "";

        if (parentDetails) {

            if (existingBranches.parentBranchName) {

                parentMessage += `Parent Branch exists.`;
                await this.updateWorkItemState(workItemTrackingRestClient, settingsDocument, project.id, parentDetails.id);

            } else {
                const defaultBranch = (await gitRestClient.getBranches(repositoryId, project.name)).find((x) => x.isBaseVersion);
                if (!defaultBranch) {
                    console.warn(`Default branch not found`);

                    globalMessagesSvc.addToast({
                        duration: 3000,
                        message: `Default branch not found`
                    });

                    return;
                }
                await this.createRef(gitRestClient, repositoryId, defaultBranch.commit.commitId, parentDetails.branchName);
                await this.linkBranchToWorkItem(workItemTrackingRestClient, project.id, repositoryId, parentDetails.id, parentDetails.branchName);
                await this.updateWorkItemState(workItemTrackingRestClient, settingsDocument, project.id, parentDetails.id);
                console.log(`Branch ${parentDetails.branchName} created in repository ${repository.name}`);

                parentMessage += `Parent Branch created.`

            }
        } else if (branchDetails.originalParentDetails) {
            await this.updateWorkItemState(workItemTrackingRestClient, settingsDocument, project.id, branchDetails.originalParentDetails.id);
        }

        if (existingBranches.branchName) {
            console.info(`Branch ${branchName} already exists in repository ${repository.name}`);

            globalMessagesSvc.addToast({
                duration: 3000,
                message: `Branch ${branchName} already exists`,
                callToAction: "Open branch",
                onCallToActionClick: async () => {
                    navigationService.openNewWindow(branchUrl, "");
                }
            });
            await this.updateWorkItemState(workItemTrackingRestClient, settingsDocument, project.id, workItemId);
            return;
        }


        let branch: GitBranchStats | undefined = undefined;

        if (parentBranchName) {
            branch = (await gitRestClient.getBranches(repositoryId, project.name)).find((x) => x.name === parentBranchName);
            if (!branch) {
                console.warn(`Branch ${parentBranchName} not found`);
                return;
            }
        } else {
            branch = (await gitRestClient.getBranches(repositoryId, project.name)).find((x) => x.isBaseVersion);
            if (!branch) {
                console.warn(`Default branch not found`);
                return;
            }
        }

        await this.createRef(gitRestClient, repositoryId, branch.commit.commitId, branchName);
        await this.linkBranchToWorkItem(workItemTrackingRestClient, project.id, repositoryId, workItemId, branchName);
        await this.updateWorkItemState(workItemTrackingRestClient, settingsDocument, project.id, workItemId);
        console.log(`Branch ${branchName} created in repository ${repository.name}`);

        globalMessagesSvc.addToast({
            duration: 3000,
            message: `${parentMessage} Branch ${branchName} created.`
        });

        navigationService.openNewWindow(branchUrl, "");
    }

    public async getParentDetails(workItemTrackingRestClient: WorkItemTrackingRestClient, settingsDocument: SettingsDocument, workItemId: number, project: string, shouldGetGrandParent: boolean): Promise<ParentDetails | null> {
        const workItem = await workItemTrackingRestClient.getWorkItem(workItemId, project, undefined, undefined, WorkItemExpand.Relations);

        // Initialize parent work item variables
        let parentWorkItemType = "Unknown";
        let parentWorkItemId = 0;
        let parentWorkItemTitle = "Unknown";

        // Check if the work item has a parent
        const parentLink = workItem.relations?.find(
            relation => relation.rel === "System.LinkTypes.Hierarchy-Reverse"
        );

        if (parentLink) {
            const parentId = parseInt(parentLink.url.split('/').pop() || "");

            if (parentId) {
                // Fetch parent work item details
                const parentWorkItem = await workItemTrackingRestClient.getWorkItem(
                    parentId,
                    project,
                    undefined,
                    undefined,
                    WorkItemExpand.Fields
                );
                const grandParent = shouldGetGrandParent
                    ? await this.getParentDetails(workItemTrackingRestClient, settingsDocument, parentId, project, false)
                    : null;

                parentWorkItemType = parentWorkItem.fields["System.WorkItemType"].toLowerCase().replace(/[^a-zA-Z0-9]/g, "-");
                parentWorkItemId = parentWorkItem.id;
                parentWorkItemTitle = parentWorkItem.fields["System.Title"].toLowerCase().replace(/[^a-zA-Z0-9]/g, "-");

                // Existing branches are matched on this prefix so a title change doesn't create a new branch
                const branchPrefix = parentWorkItemType + "/" + parentWorkItemId + "-";

                return {
                    id: parentWorkItemId,
                    type: parentWorkItemType,
                    title: parentWorkItemTitle,
                    branchName: branchPrefix + parentWorkItemTitle,
                    branchPrefix: branchPrefix,
                    grandParent: grandParent
                };
            }
        }

        return null;

    }

    public async getBranchDetails(workItemTrackingRestClient: WorkItemTrackingRestClient, settingsDocument: SettingsDocument, workItemId: number, project: string): Promise<BranchDetails> {
        let parentDetails = await this.getParentDetails(workItemTrackingRestClient, settingsDocument, workItemId, project, true);
        const originalParentDetails = parentDetails;
        let hasParent = !!parentDetails;
        if (parentDetails && parentDetails.branchName.includes("enhancements-and-bug-fixes")) {
            parentDetails = null;
        }

        const workItem = await workItemTrackingRestClient.getWorkItem(workItemId, project, undefined, undefined, WorkItemExpand.Fields);
        const workItemType = workItem.fields["System.WorkItemType"];
        const workItemScope = workItem.fields["Custom.Scope"];
        const workItemTitle: string = workItem.fields["System.Title"].replace(/[^a-zA-Z0-9]/g, "-");

        // Existing branches are matched on this prefix so a scope or title change doesn't create a new branch.
        // Always lowercase, like the parent branch, so the prefix lookup can't miss on case.
        const branchPrefix = (
            workItemType.replace(/[^a-zA-Z0-9]/g, "-") +
            "/" +
            (parentDetails ? (parentDetails.type + "-" + parentDetails.id) : "unparented") +
            "/" +
            workItemId +
            "-"
        ).toLowerCase();

        const branchName = (
            branchPrefix +
            (workItemScope ? (workItemScope.replace(/[^a-zA-Z0-9]/g, "-") + "-") : "") +
            workItemTitle.substring(0, 50)
        ).toLowerCase();

        return {
            parentDetails: parentDetails,
            branchName: branchName,
            branchPrefix: branchPrefix,
            workItemType: workItemType,
            hasParent: hasParent,
            originalParentDetails: originalParentDetails
        };
    }

    private async createRef(gitRestClient: GitRestClient, repositoryId: string, commitId: string, branchName: string): Promise<void> {
        const gitRefUpdate = {
            name: `refs/heads/${branchName}`,
            repositoryId: repositoryId,
            newObjectId: commitId,
            oldObjectId: "0000000000000000000000000000000000000000",
            isLocked: false
        };
        await gitRestClient.updateRefs([gitRefUpdate], repositoryId);
    }

    private async linkBranchToWorkItem(workItemTrackingRestClient: WorkItemTrackingRestClient, projectId: string, repositoryId: string, workItemId: number, branchName: string) {
        const branchRef = `${projectId}/${repositoryId}/GB${branchName}`;
        const relation: WorkItemRelation = {
            rel: "ArtifactLink",
            url: `vstfs:///Git/Ref/${encodeURIComponent(branchRef)}`,
            "attributes": {
                name: "Branch"
            }
        };
        const document: JsonPatchOperation[] = [
            {
                from: "",
                op: Operation.Add,
                path: "/relations/-",
                value: relation
            }
        ];
        await workItemTrackingRestClient.updateWorkItem(document, workItemId);
    }

    public async getExistingBranches(gitRestClient: GitRestClient, repositoryId: string, project: string, branchDetails: BranchDetails): Promise<ExistingBranches> {
        const parentBranchNames = branchDetails.parentDetails
            ? await this.findBranchesByPrefix(gitRestClient, repositoryId, project, branchDetails.parentDetails.branchPrefix)
            : [];
        const branchNames = await this.findBranchesByPrefix(gitRestClient, repositoryId, project, branchDetails.branchPrefix);

        return {
            parentBranchName: parentBranchNames.length === 1 ? parentBranchNames[0] : undefined,
            branchName: branchNames.length === 1 ? branchNames[0] : undefined,
            duplicateBranchNames: [
                ...(parentBranchNames.length > 1 ? parentBranchNames : []),
                ...(branchNames.length > 1 ? branchNames : [])
            ]
        };
    }

    private async findBranchesByPrefix(gitRestClient: GitRestClient, repositoryId: string, project: string, branchPrefix: string): Promise<string[]> {
        const refs = await gitRestClient.getRefs(repositoryId, project, `heads/${branchPrefix}`);
        // The prefix ends with "-" after the ID, so "story/100-" never matches "story/1000-"
        return refs
            .map((x) => x.name.substring("refs/heads/".length))
            .filter((x) => x.toLowerCase().startsWith(branchPrefix));
    }

    private async updateWorkItemState(workItemTrackingRestClient: WorkItemTrackingRestClient, settingsDocument: SettingsDocument, projectId: string, workItemId: number) {
        try {
            if (settingsDocument.updateWorkItemState) {
                const workItem = await workItemTrackingRestClient.getWorkItem(workItemId, projectId);
                const workItemType = workItem.fields["System.WorkItemType"];
                if (workItemType in settingsDocument.workItemState && settingsDocument.workItemState[workItemType].isActive) {
                    const newState = settingsDocument.workItemState[workItemType].value;

                    const user = SDK.getUser();
                    const assignedTo = user.displayName;


                    const document: JsonPatchOperation[] = [
                        {
                            from: "",
                            op: Operation.Add,
                            path: "/fields/System.State",
                            value: newState
                        },
                        {
                            from: "",
                            op: Operation.Add,
                            path: "/fields/System.AssignedTo",
                            value: assignedTo
                        }
                    ];
                    await workItemTrackingRestClient.updateWorkItem(document, workItemId);
                }
            }
        } catch (error) {
            console.warn("Update WorkItem State failed", error);
        }
    }
}
