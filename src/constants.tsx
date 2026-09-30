import SettingsDocument from "./settingsDocument";

export class Constants {
    public static DefaultBranchNameTemplate: string = "feature/${System.Id}-${System.Title}";

    public static DefaultSettingsDocument: SettingsDocument = {
        defaultBranchNameTemplate: Constants.DefaultBranchNameTemplate,
        branchNameTemplates: {
            "Bug": { isActive: true, value: "bugs/${System.Id}-${System.Title}" },
            "Epic": { isActive: true, value: "epics/${System.Id}/${System.Title}" },
            "Feature": { isActive: true, value: "features/${System.Id}/${System.Title}" },
            "Task": { isActive: true, value: "tasks/${System.Id}-${System.Title}" },
            "Test Case": { isActive: true, value: "tests/${System.Id}-${System.Title}" },
            "User Story": { isActive: true, value: "stories/${System.Id}/${System.Title}" },
            "Vulnerability": { isActive: true, value: "vulnerabilities/${System.Id}/${System.Title}" }
        },
        nonAlphanumericCharactersReplacement: "-",
        lowercaseBranchName: true,
        id: "",
        updateWorkItemState: true,
        workItemState: {
            "Bug": { isActive: true, value: "Active" },
            "Epic": { isActive: true, value: "Active" },
            "Feature": { isActive: true, value: "Active" },
            "Task": { isActive: true, value: "Active" },
            "Test Case": { isActive: true, value: "Design" },
            "User Story": { isActive: true, value: "Active" },
            "Vulnerability": { isActive: true, value: "Active" }
        }
    };

    public static NonAlphanumericCharactersReplacementSelectionOptions = [
        { id: "_", text: "_" },
        { id: "-", text: "-" }
    ];

}