import Draggable from "@/components/shared/draggable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { dispatch } from "@designcombo/events";
import { ADD_VIDEO } from "@designcombo/state";
import { generateId } from "@designcombo/timeline";
import { IVideo } from "@designcombo/types";
import React, { useState, useCallback, useEffect } from "react";
import { useIsDraggingOverTimeline } from "../hooks/is-dragging-over-timeline";
import { FileUploader } from "@/components/ui/file-uploader";
import { Button } from "@/components/ui/button";
import { Upload, X, Video as VideoIcon, Trash2, MoreVertical } from "lucide-react";
import { createUploadsDetails } from "@/utils/upload";
import { cn } from "@/lib/utils";
import { timeToString } from "../utils/time";
import useVideosStore from "../store/use-videos-store";
import type { VideoItem } from "../store/use-videos-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// Interface for uploaded video data during upload process
interface UploadingVideo {
  id: string;
  name: string;
  url: string;
  preview?: string;
  duration?: number;
  width?: number;
  height?: number;
  uploading?: boolean;
  progress?: number;
}

export const Videos = () => {
  const isDraggingOverTimeline = useIsDraggingOverTimeline();
  const {
    getUploadedVideos,
    addUploadedVideo,
    removeUploadedVideo,
    clearUploadedVideos
  } = useVideosStore();

  const [uploadingVideos, setUploadingVideos] = useState<UploadingVideo[]>([]);
  const [showUploader, setShowUploader] = useState(false);

  const uploadedVideos = getUploadedVideos();

  // Handle unhandled promise rejections
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection in Videos component:', event.reason);
      event.preventDefault(); // Prevent the default browser behavior
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Handle clearing uploaded videos with confirmation
  const handleClearUploadedVideos = () => {
    if (uploadedVideos.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to clear all ${uploadedVideos.length} uploaded video${uploadedVideos.length > 1 ? 's' : ''}? This action cannot be undone.`
    );

    if (confirmed) {
      try {
        clearUploadedVideos();
        console.log('Uploaded videos cleared successfully');
      } catch (error) {
        console.error('Error clearing uploaded videos:', error);
      }
    }
  };

  // Handle clearing all video data (including localStorage)
  const handleClearAllVideoData = () => {
    if (uploadedVideos.length === 0) {
      alert('No uploaded videos to clear.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete all uploaded videos and clear all video data? This will:\n\n• Remove all ${uploadedVideos.length} uploaded videos\n• Clear video storage data\n• This action cannot be undone\n\nClick OK to proceed or Cancel to abort.`
    );

    if (confirmed) {
      try {
        // Clear the store
        clearUploadedVideos();

        // Clear localStorage data
        localStorage.removeItem('videos-storage');

        // Clear any uploading videos
        setUploadingVideos([]);

        console.log('All video data cleared successfully');
        alert('All video data has been cleared successfully.');
      } catch (error) {
        console.error('Error clearing all video data:', error);
        alert('Error occurred while clearing video data. Please try again.');
      }
    }
  };

  const handleAddVideo = (payload: Partial<IVideo>) => {
    try {
      // payload.details.src = "https://cdn.designcombo.dev/videos/timer-20s.mp4";
      dispatch(ADD_VIDEO, {
        payload,
        options: {
          resourceId: "main",
          scaleMode: "fit",
        },
      });
    } catch (error) {
      console.error('Error adding video to timeline:', error);
    }
  };

  // Extract video metadata
  const extractVideoMetadata = useCallback((file: File): Promise<{ duration: number; width: number; height: number; preview: string }> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let objectUrl: string | null = null;

      const cleanup = () => {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
        video.removeAttribute('src');
        video.load();
      };

      video.preload = 'metadata';
      video.muted = true;

      video.onloadedmetadata = () => {
        try {
          // Generate thumbnail at 1 second or 10% of duration, whichever is smaller
          const thumbnailTime = Math.min(1, video.duration * 0.1);
          video.currentTime = thumbnailTime;
        } catch (error) {
          cleanup();
          reject(new Error('Failed to seek video for thumbnail'));
        }
      };

      video.onseeked = () => {
        try {
          if (ctx) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);

            const preview = canvas.toDataURL('image/jpeg', 0.8);

            cleanup();
            resolve({
              duration: video.duration * 1000,
              width: video.videoWidth,
              height: video.videoHeight,
              preview
            });
          } else {
            cleanup();
            reject(new Error('Could not get canvas context'));
          }
        } catch (error) {
          cleanup();
          reject(new Error('Failed to generate video thumbnail'));
        }
      };

      video.onerror = () => {
        cleanup();
        reject(new Error('Failed to load video metadata'));
      };

      try {
        objectUrl = URL.createObjectURL(file);
        video.src = objectUrl;
      } catch (error) {
        reject(new Error('Failed to create object URL for video'));
      }
    });
  }, []);

  // Handle video upload
  const handleVideoUpload = useCallback(async (files: File[]) => {
    for (const file of files) {
      const videoId = generateId();

      // Add video to uploading state
      const newUploadingVideo: UploadingVideo = {
        id: videoId,
        name: file.name,
        url: '',
        uploading: true,
        progress: 0
      };

      setUploadingVideos(prev => [...prev, newUploadingVideo]);

      try {
        console.log('Starting upload for:', file.name, 'Size:', file.size, 'Type:', file.type);

        // Validate file type
        if (!file.type.startsWith('video/')) {
          throw new Error('Invalid file type. Please select a video file.');
        }

        // Validate file size (100MB limit)
        if (file.size > 100 * 1024 * 1024) {
          throw new Error('File size too large. Please select a video under 100MB.');
        }

        // Extract metadata first
        setUploadingVideos(prev => prev.map(v =>
          v.id === videoId
            ? { ...v, progress: 5 }
            : v
        ));

        let metadata: { duration: number; width: number; height: number; preview: string };
        try {
          metadata = await extractVideoMetadata(file);
          console.log('Metadata extracted:', metadata);
        } catch (metadataError) {
          console.error('Failed to extract video metadata:', metadataError);
          throw new Error('Failed to process video file. Please try a different video.');
        }

        // Update with metadata
        setUploadingVideos(prev => prev.map(v =>
          v.id === videoId
            ? { ...v, ...metadata, progress: 15 }
            : v
        ));

        // Get upload details
        console.log('Getting upload details...');
        let uploadDetails: { uploadUrl: string; url: string; name: string; id: string };
        try {
          uploadDetails = await createUploadsDetails(file.name);
          console.log('Upload details received:', uploadDetails);
        } catch (uploadDetailsError) {
          console.error('Failed to get upload details:', uploadDetailsError);
          throw new Error('Failed to prepare upload. Please try again.');
        }

        setUploadingVideos(prev => prev.map(v =>
          v.id === videoId
            ? { ...v, progress: 25 }
            : v
        ));

        // Handle upload (real or mock)
        let finalVideoUrl = uploadDetails.url;

        if (uploadDetails.uploadUrl.startsWith('mock://')) {
          // For mock upload, use the local file URL
          finalVideoUrl = URL.createObjectURL(file);
          console.log('Using mock upload with local file URL:', finalVideoUrl);

          // Simulate upload progress
          for (let progress = 30; progress <= 100; progress += 10) {
            await new Promise(resolve => setTimeout(resolve, 100));
            setUploadingVideos(prev => prev.map(v =>
              v.id === videoId
                ? { ...v, progress }
                : v
            ));
          }
        } else {
          // Real upload with progress tracking
          console.log('Starting file upload to:', uploadDetails.uploadUrl);

          const uploadResponse = await new Promise<Response>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            let uploadTimeout: NodeJS.Timeout;

            const cleanup = () => {
              if (uploadTimeout) {
                clearTimeout(uploadTimeout);
              }
            };

            // Set upload timeout (5 minutes)
            uploadTimeout = setTimeout(() => {
              xhr.abort();
              cleanup();
              reject(new Error('Upload timeout. Please try again.'));
            }, 5 * 60 * 1000);

            // Track upload progress
            xhr.upload.addEventListener('progress', (event) => {
              try {
                if (event.lengthComputable) {
                  const percentComplete = Math.round((event.loaded / event.total) * 75) + 25; // 25-100%
                  setUploadingVideos(prev => prev.map(v =>
                    v.id === videoId
                      ? { ...v, progress: percentComplete }
                      : v
                  ));
                }
              } catch (error) {
                console.error('Error updating upload progress:', error);
              }
            });

            xhr.addEventListener('load', () => {
              cleanup();
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(new Response(xhr.response, { status: xhr.status }));
              } else {
                reject(new Error(`Upload failed with status: ${xhr.status}`));
              }
            });

            xhr.addEventListener('error', () => {
              cleanup();
              reject(new Error('Network error during upload'));
            });

            xhr.addEventListener('abort', () => {
              cleanup();
              reject(new Error('Upload was cancelled'));
            });

            try {
              xhr.open('PUT', uploadDetails.uploadUrl);
              xhr.setRequestHeader('Content-Type', file.type);
              xhr.send(file);
            } catch (error) {
              cleanup();
              reject(new Error('Failed to start upload'));
            }
          });

          if (!uploadResponse.ok) {
            throw new Error(`Upload failed with status: ${uploadResponse.status}`);
          }
        }

        console.log('Upload successful, adding to store...');

        // Add to permanent store
        try {
          addUploadedVideo({
            id: videoId,
            type: "video",
            details: {
              src: finalVideoUrl,
            },
            preview: metadata.preview,
            duration: metadata.duration,
            name: file.name,
          });
          console.log('Video added to store successfully');
        } catch (storeError) {
          console.error('Failed to add video to store:', storeError);
          throw new Error('Failed to save video. Please try again.');
        }

        // Remove from uploading state
        setUploadingVideos(prev => prev.filter(v => v.id !== videoId));

      } catch (error) {
        console.error('Upload failed for', file.name, ':', error);

        // Mark upload as failed
        setUploadingVideos(prev => prev.map(v =>
          v.id === videoId
            ? { ...v, uploading: false, progress: 0 }
            : v
        ));

        // Remove after 5 seconds to show the error state
        setTimeout(() => {
          setUploadingVideos(prev => prev.filter(v => v.id !== videoId));
        }, 5000);
      }
    }

    setShowUploader(false);
  }, [extractVideoMetadata, addUploadedVideo]);



  return (
    <div className="flex flex-1 flex-col">
      <div className="text-text-primary flex h-12 flex-none items-center justify-between px-4 text-sm font-medium">
        <span>Videos</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowUploader(!showUploader)}
            className="h-8 w-8 p-0"
          >
            <Upload className="h-4 w-4" />
          </Button>

          {/* Clear Videos Dropdown */}
          {uploadedVideos.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleClearUploadedVideos}
                  className="text-orange-600 hover:text-orange-700 focus:text-orange-700"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Uploaded Videos ({uploadedVideos.length})
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleClearAllVideoData}
                  className="text-red-600 hover:text-red-700 focus:text-red-700"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All Video Data
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <ScrollArea>
        <div className="px-4 space-y-4">
          {/* Upload Section */}
          {showUploader && (
            <div className="border border-border rounded-lg p-4">
              <FileUploader
                accept={{
                  "video/*": [".mp4", ".mov", ".avi", ".mkv", ".webm"]
                }}
                maxSize={100 * 1024 * 1024} // 100MB
                maxFileCount={5}
                multiple={true}
                onValueChange={handleVideoUpload}
                className="h-32"
              />
            </div>
          )}

          {/* Uploading Videos Section */}
          {uploadingVideos.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground px-2">
                Uploading Videos
              </div>
              <div className="masonry-sm">
                {uploadingVideos.map((video) => (
                  <UploadingVideoItem
                    key={video.id}
                    video={video}
                    shouldDisplayPreview={!isDraggingOverTimeline}
                    handleAddVideo={handleAddVideo}
                    onRemove={(id) => setUploadingVideos(prev => prev.filter(v => v.id !== id))}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Videos Section (Uploaded only, since stock videos are removed) */}
          {uploadedVideos.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <div className="text-xs font-medium text-muted-foreground">
                  My Videos ({uploadedVideos.length})
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearUploadedVideos}
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear All
                </Button>
              </div>
              <div className="masonry-sm">
                {/* Render uploaded videos */}
                {uploadedVideos.map((video) => (
                  <UploadedVideoItem
                    key={video.id}
                    video={video}
                    shouldDisplayPreview={!isDraggingOverTimeline}
                    handleAddVideo={handleAddVideo}
                    onRemove={removeUploadedVideo}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state when no videos */}
          {uploadedVideos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <VideoIcon className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-sm font-medium text-muted-foreground mb-2">No videos yet</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Upload your first video to get started
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUploader(true)}
                className="text-xs"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Video
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

const VideoItem = ({
  handleAddImage,
  video,
  shouldDisplayPreview,
}: {
  handleAddImage: (payload: Partial<IVideo>) => void;
  video: Partial<IVideo>;
  shouldDisplayPreview: boolean;
}) => {
  const style = React.useMemo(
    () => ({
      backgroundImage: `url(${video.preview})`,
      backgroundSize: "cover",
      width: "80px",
      height: "80px",
    }),
    [video.preview],
  );

  return (
    <Draggable
      data={{
        ...video,
        metadata: {
          previewUrl: video.preview,
        },
      }}
      renderCustomPreview={<div style={style} className="draggable" />}
      shouldDisplayPreview={shouldDisplayPreview}
    >
      <div
        onClick={() => {
          try {
            handleAddImage({
              id: generateId(),
              details: {
                src: video.details!.src,
              },
              metadata: {
                previewUrl: video.preview,
              },
            } as any);
          } catch (error) {
            console.error('Error adding stock video to timeline:', error);
          }
        }}
        className="flex w-full items-center justify-center overflow-hidden bg-background pb-2"
      >
        <img
          draggable={false}
          src={video.preview}
          className="h-full w-full rounded-md object-cover"
          alt="image"
        />
      </div>
    </Draggable>
  );
};

const UploadingVideoItem = ({
  video,
  shouldDisplayPreview,
  handleAddVideo,
  onRemove,
}: {
  video: UploadingVideo;
  shouldDisplayPreview: boolean;
  handleAddVideo: (payload: Partial<IVideo>) => void;
  onRemove: (videoId: string) => void;
}) => {
  const style = React.useMemo(
    () => ({
      backgroundImage: video.preview ? `url(${video.preview})` : 'none',
      backgroundSize: "cover",
      width: "80px",
      height: "80px",
    }),
    [video.preview],
  );

  const handleClick = () => {
    if (!video.uploading && video.url) {
      try {
        handleAddVideo({
          id: generateId(),
          details: {
            src: video.url,
          },
          metadata: {
            previewUrl: video.preview,
          },
          duration: video.duration,
        } as any);
      } catch (error) {
        console.error('Error adding uploading video to timeline:', error);
      }
    }
  };

  const dragData = video.url ? {
    id: video.id,
    type: "video",
    details: { src: video.url },
    metadata: { previewUrl: video.preview },
    duration: video.duration,
  } : null;

  const content = (
    <div className="relative">
      <div
        onClick={handleClick}
        className={cn(
          "flex w-full items-center justify-center overflow-hidden bg-background pb-2 relative",
          video.uploading ? "cursor-not-allowed opacity-60" : "cursor-pointer"
        )}
      >
        {video.preview ? (
          <img
            draggable={false}
            src={video.preview}
            className="h-full w-full rounded-md object-cover"
            alt={video.name}
          />
        ) : (
          <div className="h-20 w-full rounded-md bg-muted flex items-center justify-center">
            <VideoIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {/* Upload Progress Overlay */}
        {video.uploading && (
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center rounded-md">
            <div className="text-white text-xs mb-1">
              Uploading...
            </div>
            <div className="w-16 h-1 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-300"
                style={{ width: `${video.progress || 0}%` }}
              />
            </div>
            <div className="text-white text-xs mt-1">
              {video.progress || 0}%
            </div>
          </div>
        )}

        {/* Error State */}
        {!video.uploading && video.progress === 0 && !video.url && (
          <div className="absolute inset-0 bg-red-500/50 flex items-center justify-center rounded-md">
            <div className="text-white text-xs">
              Upload Failed
            </div>
          </div>
        )}

        {/* Remove Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(video.id);
          }}
          className="absolute top-1 right-1 h-6 w-6 p-0 bg-black/50 hover:bg-black/70"
        >
          <X className="h-3 w-3 text-white" />
        </Button>
      </div>

      {/* Video Name and Duration */}
      <div className="text-xs text-muted-foreground truncate px-1 mt-1">
        <div className="truncate">{video.name}</div>
        {video.duration && (
          <div className="text-xs opacity-75">
            {timeToString({ time: video.duration })}
          </div>
        )}
      </div>
    </div>
  );

  if (video.uploading || !dragData) {
    return content;
  }

  return (
    <Draggable
      data={dragData}
      renderCustomPreview={<div style={style} className="draggable" />}
      shouldDisplayPreview={shouldDisplayPreview}
    >
      {content}
    </Draggable>
  );
};

const UploadedVideoItem = ({
  video,
  shouldDisplayPreview,
  handleAddVideo,
  onRemove,
}: {
  video: VideoItem;
  shouldDisplayPreview: boolean;
  handleAddVideo: (payload: Partial<IVideo>) => void;
  onRemove: (videoId: string) => void;
}) => {
  const style = React.useMemo(
    () => ({
      backgroundImage: video.preview ? `url(${video.preview})` : 'none',
      backgroundSize: "cover",
      width: "80px",
      height: "80px",
    }),
    [video.preview],
  );

  const handleClick = () => {
    try {
      handleAddVideo({
        id: generateId(),
        details: {
          src: video.details.src,
        },
        metadata: {
          previewUrl: video.preview,
        },
        duration: video.duration,
      } as any);
    } catch (error) {
      console.error('Error adding uploaded video to timeline:', error);
    }
  };

  const dragData = {
    id: video.id,
    type: "video",
    details: { src: video.details.src },
    metadata: { previewUrl: video.preview },
    duration: video.duration,
  };

  const content = (
    <div className="relative">
      <div
        onClick={handleClick}
        className="flex w-full items-center justify-center overflow-hidden bg-background pb-2 relative cursor-pointer"
      >
        {video.preview ? (
          <img
            draggable={false}
            src={video.preview}
            className="h-full w-full rounded-md object-cover"
            alt={video.name || "Uploaded video"}
          />
        ) : (
          <div className="h-20 w-full rounded-md bg-muted flex items-center justify-center">
            <VideoIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {/* Remove Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(video.id);
          }}
          className="absolute top-1 right-1 h-6 w-6 p-0 bg-black/50 hover:bg-black/70"
        >
          <X className="h-3 w-3 text-white" />
        </Button>
      </div>

      {/* Video Name and Duration */}
      <div className="text-xs text-muted-foreground truncate px-1 mt-1">
        <div className="truncate">{video.name || "Uploaded Video"}</div>
        {video.duration && (
          <div className="text-xs opacity-75">
            {timeToString({ time: video.duration })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Draggable
      data={dragData}
      renderCustomPreview={<div style={style} className="draggable" />}
      shouldDisplayPreview={shouldDisplayPreview}
    >
      {content}
    </Draggable>
  );
};
