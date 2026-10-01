param(
    [string]$collectionUri,
    [string]$teamProject,
    [string]$repositoryName,
    [string]$pullRequestId,
    [string]$sourceBranchName,
    [string]$targetBranchName
)

if ([String]::IsNullOrWhiteSpace($collectionUri)) {
    Write-Host "Collection URI must be passed as an argument"
    exit 1
}

if ([String]::IsNullOrWhiteSpace($teamProject)) {
    Write-Host "Team Project must be passed as an argument"
    exit 1
}

if ([String]::IsNullOrWhiteSpace($repositoryName)) {
    Write-Host "Repository Name must be passed as an argument"
    exit 1
}

if ([String]::IsNullOrWhiteSpace($pullRequestId)) {
    Write-Host "Pull Request ID must be passed as an argument"
    exit 1
}

if ([String]::IsNullOrWhiteSpace($sourceBranchName)) {
    Write-Host "Source Branch Name must be passed as an argument"
    exit 1
}

if ([String]::IsNullOrWhiteSpace($targetBranchName)) {
    Write-Host "Target Branch Name must be passed as an argument"
    exit 1
}

$sourceBranchName = $sourceBranchName -replace "refs/heads/", ""

$targetBranchName = $targetBranchName -replace "refs/heads/", ""

$pattern = '^([a-zA-Z-]+\/[a-zA-Z-]+-\d+\/\d+-[a-zA-Z0-9-]+)$'
$parentPattern = '^([a-zA-Z-]+\/\d+-[a-zA-Z0-9-]+)$'

$headers = @{
    Authorization = "Bearer $env:SYSTEM_ACCESSTOKEN"
    "Content-Type" = "application/json"
}

if ($sourceBranchName -match $pattern) {

    $sourceBranchParts = $sourceBranchName -split '/'
    $parentWorkItemIdParts = $sourceBranchParts[1] -split '-'
    $parentWorkItemId = $parentWorkItemIdParts[-1]
    $parentWorkItemType = $parentWorkItemIdParts[0..($parentWorkItemIdParts.Length - 2)] -join '-'
    $parentBranchStart = "$($parentWorkItemType)/$($parentWorkItemId)-"

    $url = "$($collectionUri)$($teamProject)/_apis/git/repositories/$($repositoryName)/refs?filter=heads/$parentBranchStart&api-version=6.0"
    $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get

    if ($targetBranchName.StartsWith($parentBranchStart)) {
        if ($response.PSObject.Properties['value'] -and $response.value -is [array] -and $response.value.Count -gt 0) {
            $branchName = $response.value[0].name.Replace("refs/heads/","")
            $prUrl = "$($collectionUri)$($teamProject)/_git/$($repositoryName)/pullrequestcreate?sourceRef=$($branchName)"

            $body = @{
                comments = @(
                    @{
                        parentCommentId = 0;
                        content = "After completing this merge, you can click below link to create PR from the parent branch to main/master:`n**$($prUrl)**"
                    }
                )
                status = "closed"
            } | ConvertTo-Json

            $url = "$($collectionUri)$($teamProject)/_apis/git/repositories/$($repositoryName)/pullrequests/$($pullRequestId)/threads?api-version=6.0"
            $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Post -Body $body
        }
        Write-Host "Target is source's parent."
    } else {
        Write-Host "##vso[task.logissue type=error]Kindly change the target branch of this PR to its parent branch."

        if ($response.PSObject.Properties['value'] -and $response.value -is [array] -and $response.value.Count -gt 0) {
            $branchName = $response.value[0].name.Replace("refs/heads/","")
            Write-Host "##vso[task.logissue type=error]Parent Branch Name: $($branchName)"
        } else {
            Write-Host "##vso[task.logissue type=error]Parent Branch Name: $($parentBranchStart)*****"
        }
        exit 1
    }
} elseif ($sourceBranchName -match $parentPattern) {

    $sourceBranchParts = $sourceBranchName -split '/'
    $sourceBranchIdParts = $sourceBranchParts[1] -split '-'

    $url = "$($collectionUri)$($teamProject)/_apis/git/repositories/$($repositoryName)/refs?api-version=6.0"

    $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get

    $branchNameInclusion = "*/$($sourceBranchParts[0])-$($sourceBranchIdParts[0])/*"

    $branches = $response.value | Where-Object {
        $_.name -like "$branchNameInclusion"
    }

    if ($branches) {
        Write-Host "##vso[task.logissue type=error]Unmerged sub-branch(es) found. Restart this merge once following sub-branch(es) gets merged:"
        $branches | ForEach-Object { $_.name.Replace("refs/heads/", "##vso[task.logissue type=error]") }
        exit 1
    } else {
        Write-Output "No sub-branches found."
    }
} else {
    Write-Host "Branch name does not match the required format. No action taken."
}

Write-Host "Branch Validation Passed."
exit 0