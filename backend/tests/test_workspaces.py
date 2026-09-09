import pytest


@pytest.mark.asyncio
async def test_list_workspaces(client):
    response = await client.get("/api/v1/workspaces")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_create_workspace(client):
    payload = {
        "title": "Principal Architect Evaluation Sandbox",
        "description": "Verification of spatial computing window registry",
        "layout": "cascade",
        "initial_files": [
            {
                "name": "benchmark.ts",
                "path": "src/benchmark.ts",
                "content": "export const FPS = 60;",
                "language": "typescript"
            }
        ]
    }
    response = await client.post("/api/v1/workspaces", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == payload["title"]
    assert len(data["files"]) == 1
    assert data["files"][0]["name"] == "benchmark.ts"


@pytest.mark.asyncio
async def test_create_file_in_workspace(client):
    # Fetch first workspace
    ws_res = await client.get("/api/v1/workspaces")
    ws_id = ws_res.json()[0]["id"]
    
    file_payload = {
        "name": "OneEuroFilter.ts",
        "path": "src/filters/OneEuroFilter.ts",
        "content": "export class OneEuroFilter {}",
        "language": "typescript"
    }
    response = await client.post(f"/api/v1/workspaces/{ws_id}/files", json=file_payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "OneEuroFilter.ts"
    assert data["workspace_id"] == ws_id
