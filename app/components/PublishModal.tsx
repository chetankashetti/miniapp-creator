'use client';

import { useState } from 'react';
import { Copy, Check, AlertCircle } from 'lucide-react';
import { useAuthContext } from '../contexts/AuthContext';

interface PublishModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectUrl?: string;
    projectId?: string;
}

export function PublishModal({ isOpen, onClose, projectUrl, projectId }: PublishModalProps) {
    const [currentStep, setCurrentStep] = useState(1);
    const [copied, setCopied] = useState(false);
    const [domainCopied, setDomainCopied] = useState(false);
    const [manifestJson, setManifestJson] = useState('');
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishSuccess, setPublishSuccess] = useState(false);
    const [publishError, setPublishError] = useState<string | null>(null);
    const [manifestUrl, setManifestUrl] = useState<string | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);
    const { sessionToken } = useAuthContext();

    const handleCopyMessage = async () => {
        const message = 'Update the farcaster.json file with this manifest: [paste your manifest JSON here]';
        try {
            await navigator.clipboard.writeText(message);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    const handleCopyDomain = async () => {
        if (!projectUrl) return;
        const domain = projectUrl.replace(/^https?:\/\//, '');
        try {
            await navigator.clipboard.writeText(domain);
            setDomainCopied(true);
            setTimeout(() => setDomainCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy domain: ', err);
        }
    };

    const validateManifestJson = (jsonString: string): { valid: boolean; error?: string; manifest?: unknown } => {
        try {
            const manifest = JSON.parse(jsonString);

            if (!manifest || typeof manifest !== 'object') {
                return { valid: false, error: 'Manifest must be a valid JSON object' };
            }

            if (!manifest.accountAssociation) {
                return { valid: false, error: 'Missing required field: accountAssociation' };
            }

            if (!manifest.miniapp && !manifest.frame) {
                return { valid: false, error: 'Manifest must contain either "miniapp" or "frame" field' };
            }

            return { valid: true, manifest };
        } catch (err) {
            return { valid: false, error: 'Invalid JSON format' };
        }
    };

    const handleValidate = () => {
        const result = validateManifestJson(manifestJson);
        if (result.valid) {
            setValidationError(null);
            setPublishError(null);
        } else {
            setValidationError(result.error || 'Invalid manifest');
        }
    };

    const handlePublish = async () => {
        if (!projectId || !sessionToken) {
            setPublishError('Missing project information or authentication');
            return;
        }

        const result = validateManifestJson(manifestJson);
        if (!result.valid) {
            setValidationError(result.error || 'Invalid manifest');
            return;
        }

        setIsPublishing(true);
        setPublishError(null);
        setValidationError(null);

        try {
            const response = await fetch('/api/publish', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: JSON.stringify({
                    projectId: projectId,
                    manifest: result.manifest
                })
            });

            const data = await response.json();

            if (response.ok) {
                setPublishSuccess(true);
                setManifestUrl(data.manifestUrl);
            } else {
                setPublishError(data.error || 'Failed to publish manifest');
            }
        } catch (err) {
            console.error('Error publishing manifest:', err);
            setPublishError('Network error: Failed to publish manifest');
        } finally {
            setIsPublishing(false);
        }
    };

    const handleCopyManifestUrl = async () => {
        if (!manifestUrl) return;
        try {
            await navigator.clipboard.writeText(manifestUrl);
        } catch (err) {
            console.error('Failed to copy manifest URL: ', err);
        }
    };

    if (!isOpen) return null;

    const steps = [
        {
            id: 1,
            title: "Create Farcaster Manifest",
            description: "Set up your manifest using Farcaster's Developer Tools.",
            content: (
                <div className="space-y-4">


                    {projectUrl && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <h4 className="font-semibold text-gray-900 mb-2">Your Project Domain</h4>
                            <div className="flex items-center gap-2">
                                <code className="text-sm text-gray-700 break-all bg-gray-100 p-2 rounded flex-1">
                                    {projectUrl.replace(/^https?:\/\//, '')}
                                </code>
                                <button
                                    onClick={handleCopyDomain}
                                    className="p-2 hover:bg-gray-200 rounded transition-colors duration-200"
                                    title={domainCopied ? "Copied!" : "Copy domain"}
                                >
                                    {domainCopied ? (
                                        <Check className="w-5 h-5 text-green-600" />
                                    ) : (
                                        <Copy className="w-5 h-5 text-gray-600" />
                                    )}
                                </button>
                            </div>
                            <p className="text-xs text-gray-600 mt-2">
                                Use this domain (without https://) when creating your manifest
                            </p>
                        </div>
                    )}

                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                        <h4 className="font-semibold text-purple-900 mb-3">Steps to Create Manifest</h4>
                        <ol className="text-sm text-purple-800 space-y-3">
                            <li className="flex items-start gap-3">
                                <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">1</span>
                                <div>
                                    <strong>Visit Farcaster Developer Tools</strong>
                                    <br />
                                    <a href="https://farcaster.xyz/~/developers/mini-apps/manifest" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                        https://farcaster.xyz/~/developers/mini-apps/manifest
                                    </a>
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">2</span>
                                <div>
                                    <strong>Click &quot;+ New&quot; Button</strong>
                                    <br />
                                    Click the &quot;+ New&quot; button to create a new manifest
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">3</span>
                                <div>
                                    <strong>Enter your app details</strong>
                                    <br />
                                    Use the domain above (without https://) and fill in all other required information
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">4</span>
                                <div>
                                    <strong>Click Submit</strong>
                                    <br />
                                    After filling in all required information, click the Submit button to create your manifest
                                </div>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">5</span>
                                <div>
                                    <strong>Copy your Manifest JSON</strong>
                                    <br />
                                    Copy the complete manifest JSON object that includes all your app details
                                </div>
                            </li>
                        </ol>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <h4 className="font-semibold text-gray-900 mb-3">Required Information</h4>
                        <ul className="text-sm text-gray-800 space-y-2">
                            <li>• <strong>Domain:</strong> Your app&apos;s hosting domain (without https://)</li>
                            <li>• <strong>App Name:</strong> Your miniapp&apos;s display name</li>
                            <li>• <strong>Subtitle:</strong> Very short description of your app</li>
                            <li>• <strong>Description:</strong> Brief description of your app</li>
                            <li>• <strong>Icon URL:</strong> Publicly accessible icon image (https:// required)</li>
                            <li>• <strong>Primary Category:</strong> Main app category (e.g., games, social, finance)</li>
                            <li>• <strong>Splash Image:</strong> Loading screen image (https:// required)</li>
                            <li>• <strong>Splash Background Color:</strong> Background color of the splash screen</li>
                        </ul>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h4 className="font-semibold text-blue-900 mb-3">What You&apos;ll Get from Farcaster</h4>
                        <p className="text-sm text-blue-800 mb-3">
                            After creating your manifest, Farcaster will provide you with a JSON object that looks like this example.
                            This contains all the information needed to make your app discoverable on Farcaster.
                        </p>
                        <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto whitespace-pre">
                            <code>{`{
  "accountAssociation": {
    "header": "eyJmaWQiOjkxNTIsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHgwMmVmNzkwRGQ3OTkzQTM1ZkQ4NDdDMDUzRURkQUU5NDBEMDU1NTk2In0",
    "payload": "eyJkb21haW4iOiJyZXdhcmRzLndhcnBjYXN0LmNvbSJ9",
    "signature": "MHgxMGQwZGU4ZGYwZDUwZTdmMGIxN2YxMTU2NDI1MjRmZTY0MTUyZGU4ZGU1MWU0MThiYjU4ZjVmZmQxYjRjNDBiNGVlZTRhNDcwNmVmNjhlMzQ0ZGQ5MDBkYmQyMmNlMmVlZGY5ZGQ0N2JlNWRmNzMwYzUxNjE4OWVjZDJjY2Y0MDFj"
  },
  "miniapp": {
    "version": "1",
    "name": "Your App Name",
    "iconUrl": "https://your-domain.com/icon.png",
    "splashImageUrl": "https://your-domain.com/splash.png",
    "splashBackgroundColor": "#000000",
    "homeUrl": "https://your-domain.com",
    "subtitle": "Your App Subtitle",
    "description": "Your app description",
    "primaryCategory": "social",
    "tags": ["your", "app", "tags"],
    "heroImageUrl": "https://your-domain.com/hero.png",
    "tagline": "Your app tagline",
    "ogTitle": "Your App Title",
    "ogDescription": "Your app description for social sharing",
    "ogImageUrl": "https://your-domain.com/og-image.png"
  }
}`}</code>
                        </pre>
                        <div className="mt-3 p-3 bg-blue-100 rounded-lg">
                            <p className="text-xs text-blue-700">
                                <strong>💡 Tip:</strong> The <code className="bg-blue-200 px-1 rounded">accountAssociation</code> section contains your app&apos;s authentication details.
                                The <code className="bg-blue-200 px-1 rounded">miniapp/frame</code> section contains your app&apos;s display information.
                            </p>
                        </div>
                    </div>
                </div>
            )
        },
        {
            id: 2,
            title: "Publish Your Manifest",
            description: "Paste your manifest JSON and publish it to your app.",
            content: (
                <div className="space-y-4">

                    {/* Manifest Input Section */}
                    <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
                        <h4 className="font-semibold text-gray-900 mb-3">Paste Your Manifest JSON</h4>
                        <p className="text-sm text-gray-800 mb-3">
                            Paste the complete manifest JSON you received from Farcaster Developer Tools in Step 1.
                        </p>
                        <textarea
                            value={manifestJson}
                            onChange={(e) => setManifestJson(e.target.value)}
                            className="w-full h-48 p-3 border border-gray-300 rounded font-mono text-xs bg-white"
                            placeholder='Paste your manifest JSON here, e.g.:
{
  "accountAssociation": {
    "header": "...",
    "payload": "...",
    "signature": "..."
  },
  "miniapp": {
    "version": "1",
    "name": "Your App Name",
    ...
  }
}'
                            disabled={isPublishing || publishSuccess}
                        />

                        {/* Validation Error */}
                        {validationError && (
                            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded flex items-start gap-2">
                                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                                <div className="text-sm text-red-700">{validationError}</div>
                            </div>
                        )}

                        {/* Publish Error */}
                        {publishError && (
                            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded flex items-start gap-2">
                                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                                <div className="text-sm text-red-700">{publishError}</div>
                            </div>
                        )}

                        {/* Success Message */}
                        {publishSuccess && manifestUrl && (
                            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                                <div className="flex items-start gap-2 mb-2">
                                    <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-green-700 font-semibold">Manifest published successfully!</div>
                                </div>
                                <div className="ml-7 text-sm text-green-700">
                                    Your manifest is now live at:
                                </div>
                                <div className="ml-7 mt-2 flex items-center gap-2">
                                    <code className="text-xs text-green-800 bg-green-100 p-2 rounded flex-1 break-all">
                                        {manifestUrl}
                                    </code>
                                    <button
                                        onClick={handleCopyManifestUrl}
                                        className="p-2 hover:bg-green-200 rounded transition-colors duration-200"
                                        title="Copy manifest URL"
                                    >
                                        <Copy className="w-4 h-4 text-green-600" />
                                    </button>
                                    <button
                                        onClick={() => window.open(manifestUrl, '_blank')}
                                        className="p-2 hover:bg-green-200 rounded transition-colors duration-200"
                                        title="Open manifest"
                                    >
                                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="mt-3 flex gap-2">
                            <button
                                onClick={handleValidate}
                                disabled={!manifestJson || isPublishing || publishSuccess}
                                className={`px-4 py-2 rounded font-medium transition-colors ${
                                    !manifestJson || isPublishing || publishSuccess
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer'
                                }`}
                            >
                                Validate
                            </button>
                            <button
                                onClick={handlePublish}
                                disabled={!manifestJson || isPublishing || publishSuccess}
                                className={`px-4 py-2 rounded font-medium transition-colors ${
                                    !manifestJson || isPublishing || publishSuccess
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-black text-white hover:bg-black-80 cursor-pointer'
                                }`}
                            >
                                {isPublishing ? 'Publishing...' : publishSuccess ? 'Published' : 'Publish'}
                            </button>
                        </div>
                    </div>

                    {/* Alternative Manual Method */}
                    <div className="bg-gray-100 border border-gray-300 rounded-lg p-4">
                        <h4 className="font-semibold text-gray-900 mb-3">Alternative: Update via Chat</h4>
                        <p className="text-sm text-gray-800 mb-3">
                            You can also tell Minidev to update your app using the chat interface.
                        </p>
                        <div className="bg-white border border-green-300 rounded-lg p-4">
                            <h5 className="font-medium text-green-900 mb-2">Copy this message and paste it in the chat:</h5>
                            <div className="bg-gray-50 border border-gray-300 rounded p-3 text-sm flex items-center justify-between">
                                <code className="text-green-700 font-mono flex-1">
                                    Update the farcaster.json file with this manifest: [paste your manifest JSON here]
                                </code>
                                <button
                                    onClick={handleCopyMessage}
                                    className="ml-3 p-2 hover:bg-gray-200 rounded transition-colors duration-200"
                                    title={copied ? "Copied!" : "Copy message"}
                                >
                                    {copied ? (
                                        <Check className="w-5 h-5 text-green-600" />
                                    ) : (
                                        <Copy className="w-5 h-5 text-gray-600" />
                                    )}
                                </button>
                            </div>
                            <div className="mt-3 p-2 bg-green-100 rounded">
                                <p className="text-xs text-green-700">
                                    <strong> Instructions:</strong> Replace <code className="bg-green-200 px-1 rounded">[paste your manifest JSON here]</code> with the actual JSON you copied from Farcaster in Step 1.
                                </p>
                            </div>
                        </div>
                    </div>


                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                        <h4 className="font-semibold text-purple-900 mb-3">What Happens Next</h4>
                        <div className="space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">1</div>
                                <div>
                                    <strong className="text-purple-900">Minidev Updates Your App</strong>
                                    <p className="text-sm text-purple-800">Minidev will automatically update your farcaster.json file with the manifest you provided</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">2</div>
                                <div>
                                    <strong className="text-purple-900">Your App Gets Configured</strong>
                                    <p className="text-sm text-purple-800">Your app will be properly set up with all the Farcaster requirements and settings</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">3</div>
                                <div>
                                    <strong className="text-purple-900">Manifest Goes Live</strong>
                                    <p className="text-sm text-purple-800">The manifest will be available at your domain at <code className="bg-purple-200 px-1 rounded">/.well-known/farcaster.json</code></p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">4</div>
                                <div>
                                    <strong className="text-purple-900">Your App Becomes Discoverable</strong>
                                    <p className="text-sm text-purple-800">Users can now find and use your app directly from Farcaster!</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                        <h4 className="font-semibold text-orange-900 mb-3">🔧 Managing Your App After Launch</h4>
                        <p className="text-sm text-orange-800 mb-3">
                            Once your app is live on Farcaster, you can manage it through the Farcaster Developer Tools dashboard:
                        </p>
                        <div className="space-y-2 text-sm text-orange-800">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                                <span><strong>Edit App Details:</strong> Update your app's name, description, images, and other information</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                                <span><strong>Monitor Performance:</strong> Track how many users are discovering and using your app</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                                <span><strong>Update & Redeploy:</strong> Make changes to your app and redeploy without going through the full setup process</span>
                            </div>
                        </div>
                        <div className="mt-3 p-2 bg-orange-100 rounded">
                            <p className="text-xs text-orange-700">
                                <strong>🎯 Pro Tip:</strong> You can always come back to Minidev to make code changes to your app, then update the manifest through Farcaster Developer Tools.
                            </p>
                        </div>
                    </div> */}
                </div>
            )
        }
    ];

    const currentStepData = steps.find(step => step.id === currentStep);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <div>
                        <h2 className="text-2xl font-funnel-display font-semibold text-black">
                            Publish to Farcaster
                        </h2>
                        <p className="text-gray-600 mt-1">
                            Use Farcaster Hosted Manifests to publish your miniapp
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-900 cursor-pointer"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Progress Steps */}
                <div className="px-6 py-4 bg-gray-50">
                    <div className="flex items-center justify-center">
                        {steps.map((step, index) => (
                            <div key={step.id} className="flex items-center">
                                <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${currentStep >= step.id
                                    ? 'bg-black text-white border-black'
                                    : 'bg-white text-gray-400 border-gray-300'
                                    }`}>
                                    {currentStep > step.id ? (
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                    ) : (
                                        <span className="text-sm font-medium">{step.id}</span>
                                    )}
                                </div>
                                {index < steps.length - 1 && (
                                    <div className={`w-20 h-0.5 mx-2 ${currentStep > step.id ? 'bg-black' : 'bg-gray-300'
                                        }`} />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[60vh]">
                    {currentStepData && (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-xl font-semibold text-black mb-2">
                                    Step {currentStepData.id}: {currentStepData.title}
                                </h3>
                                <p className="text-gray-600 mb-4">
                                    {currentStepData.description}
                                </p>
                            </div>
                            {currentStepData.content}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
                    <button
                        onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
                        disabled={currentStep === 1}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors  ${currentStep === 1
                            ? 'text-gray-400 cursor-not-allowed'
                            : 'text-black hover:bg-gray-200 cursor-pointer'
                            }`}
                    >
                        Previous
                    </button>

                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">
                            Step {currentStep} of {steps.length}
                        </span>
                    </div>

                    <button
                        onClick={() => {
                            if (currentStep < steps.length) {
                                setCurrentStep(currentStep + 1);
                            } else {
                                onClose();
                            }
                        }}
                        className="px-6 py-2 bg-black text-white rounded-lg font-medium hover:bg-black-80 transition-colors cursor-pointer"
                    >
                        {currentStep === steps.length ? 'Finish' : 'Next'}
                    </button>
                </div>
            </div>
        </div>
    );
} 