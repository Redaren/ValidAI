#!/usr/bin/env python3
"""
Test script for execute-processor-run Edge Function
"""
import os
import requests
import json
from pathlib import Path

# Configuration
SUPABASE_URL = "https://xczippkxxdqlvaacjexj.supabase.co"
SUPABASE_ANON_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_ANON_KEY:
    print("ERROR: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY not found in environment")
    exit(1)

if not SUPABASE_SERVICE_ROLE_KEY:
    print("ERROR: SUPABASE_SERVICE_ROLE_KEY not found in environment")
    exit(1)

# Test data
PROCESSOR_ID = "9024a072-211d-40fc-a64f-b9d7a7f31a72"  # Contract Review Assistant
ORGANIZATION_ID = "b822d5c9-706a-4e37-9d7a-c0b0417efe56"
TEST_FILE = Path(__file__).parent / "test-document.txt"

def upload_document():
    """Upload test document to Supabase Storage and create document record"""
    print("\n=== Step 1: Uploading document to Supabase Storage ===")

    # Upload to storage
    storage_path = f"{ORGANIZATION_ID}/test-contract-{os.urandom(4).hex()}.txt"

    with open(TEST_FILE, 'rb') as f:
        file_content = f.read()

    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "text/plain"
    }

    upload_url = f"{SUPABASE_URL}/storage/v1/object/documents/{storage_path}"
    response = requests.post(upload_url, headers=headers, data=file_content)

    if response.status_code not in [200, 201]:
        print(f"ERROR: Failed to upload to storage: {response.status_code}")
        print(response.text)
        return None

    print(f"✓ Uploaded to storage: {storage_path}")

    # Create document record
    print("\n=== Step 2: Creating document record in database ===")

    doc_data = {
        "name": "test-contract.txt",
        "size_bytes": len(file_content),
        "mime_type": "text/plain",
        "storage_path": storage_path,
        "organization_id": ORGANIZATION_ID
    }

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }

    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/documents",
        headers=headers,
        json=doc_data
    )

    if response.status_code not in [200, 201]:
        print(f"ERROR: Failed to create document record: {response.status_code}")
        print(response.text)
        return None

    document = response.json()
    if isinstance(document, list):
        document = document[0]

    document_id = document['id']
    print(f"✓ Created document record: {document_id}")

    return document_id

def execute_processor_run(document_id):
    """Call the execute-processor-run Edge Function"""
    print("\n=== Step 3: Executing processor run ===")

    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "processor_id": PROCESSOR_ID,
        "document_id": document_id
    }

    print(f"Calling Edge Function with payload: {json.dumps(payload, indent=2)}")

    response = requests.post(
        f"{SUPABASE_URL}/functions/v1/execute-processor-run",
        headers=headers,
        json=payload,
        timeout=30
    )

    print(f"\nResponse Status: {response.status_code}")
    print(f"Response Body: {response.text}")

    if response.status_code == 202:
        result = response.json()
        run_id = result.get('run_id')
        print(f"\n✓ Run initiated successfully!")
        print(f"✓ Run ID: {run_id}")
        print(f"✓ Monitor at: {SUPABASE_URL}/project/xczippkxxdqlvaacjexj/editor?table=runs")
        return run_id
    else:
        print(f"\n✗ Run failed with status {response.status_code}")
        return None

def check_run_status(run_id):
    """Check the status of the run"""
    print(f"\n=== Step 4: Checking run status ===")

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"
    }

    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/runs?id=eq.{run_id}&select=*",
        headers=headers
    )

    if response.status_code == 200:
        runs = response.json()
        if runs:
            run = runs[0]
            print(f"Status: {run['status']}")
            print(f"Total Operations: {run['total_operations']}")
            print(f"Completed: {run['completed_operations']}")
            print(f"Failed: {run['failed_operations']}")
            print(f"Started: {run['started_at']}")
            print(f"Completed: {run.get('completed_at', 'N/A')}")
            return run

    return None

if __name__ == "__main__":
    print("=== ValidAI Processor Run Test ===")
    print(f"Processor: {PROCESSOR_ID}")
    print(f"Organization: {ORGANIZATION_ID}")

    # Step 1 & 2: Upload document
    document_id = upload_document()
    if not document_id:
        exit(1)

    # Step 3: Execute processor run
    run_id = execute_processor_run(document_id)
    if not run_id:
        exit(1)

    # Step 4: Check status
    import time
    time.sleep(2)  # Wait for processing to start
    check_run_status(run_id)

    print("\n=== Test Complete ===")
    print(f"Run ID: {run_id}")
    print(f"Document ID: {document_id}")
    print("\nMonitor progress:")
    print(f"  Runs: {SUPABASE_URL}/project/xczippkxxdqlvaacjexj/editor?table=runs")
    print(f"  Operation Results: {SUPABASE_URL}/project/xczippkxxdqlvaacjexj/editor?table=operation_results")
