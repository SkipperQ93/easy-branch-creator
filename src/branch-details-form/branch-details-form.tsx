import "./branch-details-form.scss";

import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import {CommonServiceIds, getClient, IGlobalMessagesService} from "azure-devops-extension-api";

import { Button } from "azure-devops-ui/Button";
import { ButtonGroup } from "azure-devops-ui/ButtonGroup";
import { WorkItemTrackingRestClient } from "azure-devops-extension-api/WorkItemTracking";
import { BranchCreator } from "../branch-creator";
import { StorageService } from "../storage-service";
import { RepositorySelect } from "../repository-select/repository-select";
import { BranchSelect } from "../branch-select/branch-select";

export interface ISelectBranchDetailsResult {
    repositoryId: string;
    sourceBranchName?: string;
}

interface ISelectBranchDetailsState {
    projectName?: string;
    workItems: number[];
    selectedRepositoryId?: string;
    sourceBranchName?: string;
    ready: boolean;
    branchNames: string[];
    parentBranchName: string | undefined;
}

class BranchDetailsForm extends React.Component<{}, ISelectBranchDetailsState> {
    constructor(props: {}) {
        super(props);
        this.state = { workItems: [], branchNames: [], parentBranchName: undefined, ready: false };
    }

    public componentDidMount() {
        SDK.init();

        SDK.ready().then(async () => {
            const config = SDK.getConfiguration();
            if (config.dialog) {
                SDK.resize(undefined, 275);
            }

            this.setState({ projectName: config.projectName, workItems: config.workItems, selectedRepositoryId: config.initialValue, ready: false, branchNames: [] });

            await this.setBranchNames();

            this.setState(prevState => ({
                ...prevState,
                ready: true
            }));
        });
    }

    public render(): JSX.Element {
        return (
            <div className="branch-details-form flex-column flex-grow rhythm-vertical-16">
                <div className="flex-grow">
                    <RepositorySelect
                        projectName={this.state.projectName}
                        onRepositoryChange={(newRepositoryId) => this.onRepositoryChange(newRepositoryId)} />
                    {
                        this.state.parentBranchName &&
                        <BranchSelect
                            projectName={this.state.projectName}
                            repositoryId={this.state.selectedRepositoryId}
                            parentBranchName={this.state.parentBranchName}
                            onBranchChange={(newBranchName) => this.onSourceBranchNameChange(newBranchName)} />
                    }
                    <p>Branch Name</p>
                    <div className="branchNames flex-column scroll-auto">
                        <div>
                            <ul>
                                {this.state.branchNames.map(b => <li key={b}>{b}</li>)}
                            </ul>
                        </div>
                    </div>
                </div>
                <ButtonGroup className="branch-details-form-button-bar ">
                    <Button
                        disabled={!this.state.selectedRepositoryId}
                        primary={true}
                        text="Create Branch"
                        onClick={() => this.close(this.state.selectedRepositoryId ? {
                            repositoryId: this.state.selectedRepositoryId,
                            sourceBranchName: this.state.sourceBranchName
                        } : undefined)}
                    />
                    <Button
                        text="Cancel"
                        onClick={() => this.close(undefined)}
                    />
                </ButtonGroup>
            </div>
        );
    }

    private close(result: ISelectBranchDetailsResult | undefined) {
        const config = SDK.getConfiguration();
        if (config.dialog) {
            config.dialog.close(result);
        }
    }

    private onRepositoryChange(newRepositoryId?: string | undefined): void {
        this.setState(prevState => ({
            ...prevState,
            selectedRepositoryId: newRepositoryId
        }));
    }

    private onSourceBranchNameChange(newBranchName?: string | undefined): void {
        this.setState(prevState => ({
            ...prevState,
            sourceBranchName: newBranchName
        }));
    }

    private async setBranchNames() {
        if (this.state.projectName) {
            const globalMessagesSvc = await SDK.getService<IGlobalMessagesService>(CommonServiceIds.GlobalMessagesService);
            const workItemTrackingRestClient = getClient(WorkItemTrackingRestClient);
            const storageService = new StorageService();
            const settingsDocument = await storageService.getSettings();

            const branchCreator = new BranchCreator();
            let branchNames: string[] = [];
            for await (const workItemId of this.state.workItems) {
                const branchDetails = await branchCreator.getBranchDetails(workItemTrackingRestClient, settingsDocument, workItemId, this.state.projectName!);

                if (branchDetails.workItemType.toLowerCase() !== "task" && branchDetails.workItemType.toLowerCase() !== "bug") {
                    globalMessagesSvc.addDialog({
                        message: `Kindly create a Task/Bug and create branch for that instead of directly working on this ${branchDetails.workItemType}.`,
                    });
                    this.close(undefined);
                }

                if (branchDetails.parentDetails) {

                    if (branchDetails.parentDetails.type.toLowerCase() !== "vulnerability" && branchDetails.parentDetails.type.toLowerCase() !== "user-story") {
                        globalMessagesSvc.addDialog({
                            message: `Kindly create branch on an item that is under a User Story/Vulnerability. Parent: ${branchDetails.parentDetails.type}`,
                        });
                        this.close(undefined);
                    }

                }

                this.setState(prevState => ({
                    ...prevState,
                    parentBranchName: branchDetails.parentDetails?.branchName
                }))
                branchNames.push(branchDetails.branchName);
            }

            this.setState(prevState => ({
                ...prevState,
                branchNames: branchNames
            }));
        }
    }
}

ReactDOM.render(<BranchDetailsForm />, document.getElementById("root"));
