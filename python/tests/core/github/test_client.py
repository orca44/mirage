# ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========

from mirage.core.github._client import github_headers, github_url


def test_github_headers_contains_auth():
    headers = github_headers("ghp_test123")
    assert headers["Authorization"] == "Bearer ghp_test123"
    assert headers["Accept"] == "application/vnd.github+json"
    assert "X-GitHub-Api-Version" in headers


def test_github_url_simple():
    url = github_url("/repos/{owner}/{repo}/git/trees/{sha}",
                     owner="acme",
                     repo="proj",
                     sha="abc123")
    assert url == "https://api.github.com/repos/acme/proj/git/trees/abc123"


def test_github_url_no_params():
    url = github_url("/rate_limit")
    assert url == "https://api.github.com/rate_limit"
