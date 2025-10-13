'use client';

import { useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

interface PublishModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectUrl?: string;
    projectId?: string;
}

export function PublishModal({ isOpen, onClose, projectUrl, projectId }: PublishModalProps) {
    const [currentStep, setCurrentStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [manifestUrl, setManifestUrl] = useState<string | null>(null);

    // Form fields
    const [formData, setFormData] = useState({
        name: '',
        iconUrl: '',
        description: '',
        homeUrl: projectUrl || '',
        splashImageUrl: '',
        splashBackgroundColor: '#ffffff'
    });

    // Form validation
    const validateForm = () => {
        if (!formData.name.trim()) {
            setError('App name is required');
            return false;
        }
        if (!formData.iconUrl.trim()) {
            setError('Icon URL is required');
            return false;
        }
        if (!formData.homeUrl.trim()) {
            setError('Home URL is required');
            return false;
        }
        // Validate URLs
        try {
            new URL(formData.iconUrl);
            new URL(formData.homeUrl);
            if (formData.splashImageUrl && formData.splashImageUrl.trim()) {
                new URL(formData.splashImageUrl);
            }
        } catch {
            setError('Please provide valid URLs');
            return false;
        }
        return true;
    };

    // Handle sign and publish
    const handleSignAndPublish = async () => {
        console.log('handleSignAndPublish called with:', { projectId, projectUrl, formData });

        if (!validateForm()) return;

        if (!projectId) {
            console.error('❌ Project ID is missing');
            setError('Project ID is missing. Please ensure your project is loaded correctly.');
            return;
        }

        if (!projectUrl) {
            console.error('❌ Project URL is missing');
            setError('Project URL is missing. Please ensure your project is deployed.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setCurrentStep(2); // Move to signing step

        try {
            // Step 1: Sign with SDK
            console.log('📝 Step 1: Extracting domain from homeUrl:', formData.homeUrl);
            let domain;
            try {
                domain = new URL(formData.homeUrl).hostname;
                console.log('✅ Domain extracted:', domain);
            } catch (urlError) {
                console.error('❌ Failed to parse home URL:', urlError);
                throw new Error(`Invalid home URL format: ${formData.homeUrl}`);
            }

            console.log('🔐 Step 2: Signing manifest with Farcaster SDK...');
            let accountAssociation;
            try {
                accountAssociation = await sdk.experimental.signManifest({ domain });
                console.log('✅ Manifest signed successfully');
                console.log('Account association:', accountAssociation);
            } catch (sdkError) {
                console.error('❌ SDK signing failed:', sdkError);
                throw new Error(`Failed to sign manifest with Farcaster: ${sdkError instanceof Error ? sdkError.message : String(sdkError)}`);
            }

            // Step 2: Build complete manifest
            console.log('📦 Step 3: Building manifest object...');
            const manifest = {
                accountAssociation,
                miniapp: {
                    version: 'vNext',
                    name: formData.name,
                    iconUrl: formData.iconUrl,
                    homeUrl: formData.homeUrl,
                    ...(formData.description && { description: formData.description }),
                    ...(formData.splashImageUrl && {
                        splashImageUrl: formData.splashImageUrl,
                        splashBackgroundColor: formData.splashBackgroundColor
                    })
                }
            };

            console.log('✅ Manifest built:', JSON.stringify(manifest, null, 2));

            // Step 3: Send to API
            console.log('🌐 Step 4: Retrieving session token...');
            const sessionToken = sessionStorage.getItem('sessionToken');
            if (!sessionToken) {
                console.error('❌ No session token found');
                throw new Error('Not authenticated. Please sign in first.');
            }
            console.log('✅ Session token retrieved');

            console.log('📤 Step 5: Sending manifest to API...', {
                endpoint: '/api/publish',
                projectId,
                hasManifest: !!manifest,
                hasSessionToken: !!sessionToken
            });

            const response = await fetch('/api/publish', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: JSON.stringify({
                    projectId,
                    manifest
                })
            });

            console.log('API response status:', response.status);
            console.log('API response headers:', response.headers);

            if (!response.ok) {
                // Try to get error details from response
                let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                    console.error('API error response:', errorData);
                } catch (parseError) {
                    // Response might not be JSON
                    console.error('Failed to parse error response as JSON:', parseError);
                    const textError = await response.text();
                    console.error('API error (non-JSON):', textError);
                    errorMessage = textError || errorMessage;
                }
                throw new Error(errorMessage);
            }

            const result = await response.json();
            console.log('API response body:', result);

            if (!result || typeof result !== 'object') {
                throw new Error('Invalid response format from server');
            }

            if (!result.success) {
                throw new Error(result.error || 'Failed to publish');
            }

            console.log('Publish successful:', result);
            setManifestUrl(result.manifestUrl);
            setCurrentStep(3); // Move to success step
        } catch (err) {
            console.error('Publish error:', err);

            // Handle specific errors
            let errorMessage = 'Failed to publish. ';

            if (err instanceof Error) {
                if (err.message.includes('not signed in') || err.message.includes('Not authenticated')) {
                    errorMessage += 'Please sign in to Farcaster first. Visit https://warpcast.com/ to create an account.';
                } else if (err.message.includes('signManifest')) {
                    errorMessage += 'SDK signing failed. Make sure you are using a Farcaster-enabled browser or wallet.';
                } else {
                    errorMessage += err.message;
                }
            } else {
                errorMessage += 'Please try again or create manifest manually at https://miniapps.farcaster.xyz/';
            }

            setError(errorMessage);
            setCurrentStep(1); // Back to form
        } finally {
            setIsLoading(false);
        }
    };

    // Reset form when modal closes
    const handleClose = () => {
        setCurrentStep(1);
        setError(null);
        setManifestUrl(null);
        setIsLoading(false);
        onClose();
    };

    if (!isOpen) return null;

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
                            {currentStep === 1 && 'Enter your app details'}
                            {currentStep === 2 && 'Signing with Farcaster...'}
                            {currentStep === 3 && 'Your app is published!'}
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        disabled={isLoading}
                        className={`p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-900 ${isLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Progress Steps */}
                <div className="px-6 py-4 bg-gray-50">
                    <div className="flex items-center justify-center">
                        {[1, 2, 3].map((step, index) => (
                            <div key={step} className="flex items-center">
                                <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${currentStep >= step
                                    ? 'bg-black text-white border-black'
                                    : 'bg-white text-gray-400 border-gray-300'
                                    }`}>
                                    {currentStep > step ? (
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                    ) : (
                                        <span className="text-sm font-medium">{step}</span>
                                    )}
                                </div>
                                {index < 2 && (
                                    <div className={`w-20 h-0.5 mx-2 ${currentStep > step ? 'bg-black' : 'bg-gray-300'}`} />
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center justify-center mt-2">
                        <span className="text-xs text-gray-600">
                            {currentStep === 1 && 'Step 1: Fill Details'}
                            {currentStep === 2 && 'Step 2: Signing'}
                            {currentStep === 3 && 'Step 3: Complete'}
                        </span>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[60vh]">
                    {/* Step 1: Form */}
                    {currentStep === 1 && (
                        <div className="space-y-4">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                                <p className="text-sm text-blue-800">
                                    Fill in your app details below. The manifest will be signed with your Farcaster account and published automatically.
                                </p>
                            </div>

                            {error && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                                    <p className="text-sm text-red-800">{error}</p>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    App Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="My Awesome App"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Icon URL <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="url"
                                    placeholder="https://example.com/icon.png"
                                    value={formData.iconUrl}
                                    onChange={(e) => setFormData({ ...formData, iconUrl: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-1">Publicly accessible icon image (recommended: 512x512px)</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Home URL <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="url"
                                    placeholder="https://example.com"
                                    value={formData.homeUrl}
                                    onChange={(e) => setFormData({ ...formData, homeUrl: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-1">Your app&apos;s main URL</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Description
                                </label>
                                <textarea
                                    placeholder="A brief description of your app"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Splash Image URL
                                </label>
                                <input
                                    type="url"
                                    placeholder="https://example.com/splash.png"
                                    value={formData.splashImageUrl}
                                    onChange={(e) => setFormData({ ...formData, splashImageUrl: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                />
                                <p className="text-xs text-gray-500 mt-1">Loading screen image (optional)</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Splash Background Color
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={formData.splashBackgroundColor}
                                        onChange={(e) => setFormData({ ...formData, splashBackgroundColor: e.target.value })}
                                        className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                                    />
                                    <input
                                        type="text"
                                        value={formData.splashBackgroundColor}
                                        onChange={(e) => setFormData({ ...formData, splashBackgroundColor: e.target.value })}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                                        placeholder="#ffffff"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Signing */}
                    {currentStep === 2 && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-black mb-4"></div>
                            <h3 className="text-xl font-semibold text-black mb-2">Signing with Farcaster...</h3>
                            <p className="text-gray-600 text-center max-w-md">
                                Please approve the signature request in your Farcaster wallet to continue.
                            </p>
                        </div>
                    )}

                    {/* Step 3: Success */}
                    {currentStep === 3 && (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-semibold text-black mb-2">Published Successfully!</h3>
                            <p className="text-gray-600 text-center mb-6">
                                Your app is now published to Farcaster and discoverable by users.
                            </p>

                            {manifestUrl && (
                                <div className="w-full bg-gray-50 border border-gray-200 rounded-lg p-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Manifest URL
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 text-sm text-gray-800 bg-white p-2 rounded border border-gray-300 break-all">
                                            {manifestUrl}
                                        </code>
                                        <a
                                            href={manifestUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-2 bg-black text-white rounded hover:bg-gray-800 transition-colors cursor-pointer"
                                            title="Open manifest"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                            </svg>
                                        </a>
                                    </div>
                                </div>
                            )}

                            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 w-full">
                                <p className="text-sm text-blue-800">
                                    <strong>What&apos;s next?</strong> Users can now discover and use your app directly from Farcaster!
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
                    {currentStep === 1 && (
                        <>
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSignAndPublish}
                                disabled={isLoading}
                                className={`px-6 py-2 bg-black text-white rounded-lg font-medium transition-colors ${
                                    isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-800 cursor-pointer'
                                }`}
                            >
                                Publish
                            </button>
                        </>
                    )}
                    {currentStep === 2 && (
                        <div className="w-full flex justify-center">
                            <span className="text-sm text-gray-600">Please wait...</span>
                        </div>
                    )}
                    {currentStep === 3 && (
                        <button
                            onClick={handleClose}
                            className="w-full px-6 py-2 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors cursor-pointer"
                        >
                            Close
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
