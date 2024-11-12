import * as React from "react";
import { getClient } from "azure-devops-extension-api";
import { GitRestClient } from "azure-devops-extension-api/Git";

import { EditableDropdown } from "azure-devops-ui/EditableDropdown";
import { DropdownSelection } from "azure-devops-ui/Utilities/DropdownSelection";
import { ObservableArray } from "azure-devops-ui/Core/Observable";
import { IListBoxItem } from "azure-devops-ui/ListBox";
import { ITableColumn, SimpleTableCell } from "azure-devops-ui/Table";
import { Icon } from "azure-devops-ui/Icon";

export interface IBranchSelectProps {
    projectName?: string;
    repositoryId?: string;
    parentBranchName?: string;
    onBranchChange: (newBranchName?: string) => void;
}

interface IBranchSelectState {
    ready: boolean;
}

export class BranchSelect extends React.Component<IBranchSelectProps, IBranchSelectState> {
    private branches = new ObservableArray<IListBoxItem<string>>();
    private branchSelection = new DropdownSelection();

    constructor(props: { onBranchChange: (newBranchName?: string) => void }) {
        super(props);
        this.state = { ready: false };
    }

    public async componentDidMount() {
        await this.loadBranches();

        this.setState(prevState => ({
            ...prevState,
            ready: true
        }));
    }

    public async componentDidUpdate(prevProps: IBranchSelectProps) {
        if (prevProps.repositoryId !== this.props.repositoryId) {
            await this.loadBranches();
        }
    }

    public render(): JSX.Element {
        return (
            <div className="flex-column">
                <label className="bolt-formitem-label body-m">Based on</label>
                <EditableDropdown<string>
                    disabled={true}
                    items={this.branches}
                    selection={this.branchSelection}
                    onValueChange={(item?: IListBoxItem<string>) => {
                        this.setSelectedBranchName(item?.data);
                    }}
                    renderItem={(rowIndex: number, columnIndex: number, tableColumn: ITableColumn<IListBoxItem<string>>, tableItem: IListBoxItem<string>) => {
                        return (
                            <SimpleTableCell
                                columnIndex={columnIndex}
                                key={tableItem.id}
                                tableColumn={tableColumn}
                            >
                                <div className="bolt-list-box-cell-container"
                                >
                                    <span className="bolt-list-cell-text">
                                        <span className="text-ellipsis body-m">
                                            <Icon iconName="BranchMerge" />
                                            {tableItem.text}
                                        </span>
                                    </span>
                                </div>
                            </SimpleTableCell>
                        );
                    }}
                />
            </div>
        );
    }

    private async loadBranches() {
        if (!!!this.props.repositoryId || !!!this.props.projectName|| !!!this.props.parentBranchName) {
            return;
        }

        this.branches.removeAll();
        this.branches.push( { id: this.props.parentBranchName, data: this.props.parentBranchName, text: this.props.parentBranchName })

        this.setSelectedBranchName(this.props.parentBranchName);
        this.branchSelection.select(0);

    }

    private setSelectedBranchName(branchName?: string) {
        this.props.onBranchChange(branchName);
    }
}
