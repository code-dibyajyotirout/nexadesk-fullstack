from fastapi import APIRouter, HTTPException
from app.schemas.ai import AIScaffoldRequest, AIScaffoldResponse
from app.services.scaffold_service import AIScaffoldService

router = APIRouter()


@router.post("/ai/scaffold", response_model=AIScaffoldResponse, summary="Generate fullstack architecture scaffold from prompt")
async def generate_scaffold(request: AIScaffoldRequest):
    try:
        response = AIScaffoldService.generate_scaffold(request)
        return response
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scaffolding engine failure: {str(e)}")
